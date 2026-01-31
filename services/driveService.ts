
import { GOOGLE_MAPS_API_KEY } from './mapsService';
import { Trip, ItineraryItem } from '../types';

const DEFAULT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '555165791365-padpj19kv864chqg9mt74i5ra9vk7fo3.apps.googleusercontent.com';

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events';
const BACKUP_FILENAME = 'wanderlust_backup.json';
const STORAGE_KEY_FILE_ID = 'wanderlust_backup_file_id';
const STORAGE_KEY_CLIENT_ID = 'wanderlust_google_client_id';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export class GoogleService {
  private static tokenClient: any;
  private static gapiInited = false;
  private static gisInited = false;

  static getClientId(): string {
    return localStorage.getItem(STORAGE_KEY_CLIENT_ID) || DEFAULT_CLIENT_ID;
  }

  static async init() {
    if (this.gapiInited && this.gisInited) return;

    // Timeout helper to prevent indefinite hanging
    const withTimeout = (promise: Promise<void>, ms: number, msg: string) => {
        return Promise.race([
            promise,
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
        ]);
    };

    try {
        await withTimeout(new Promise<void>((resolve, reject) => {
          if (window.gapi) {
            window.gapi.load('client', async () => {
              try {
                await window.gapi.client.init({
                  discoveryDocs: [
                    "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
                    "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"
                  ],
                });
                this.gapiInited = true;
                resolve();
              } catch (error: any) {
                const msg = error?.result?.error?.message || error?.message || JSON.stringify(error);
                reject(new Error(msg));
              }
            });
          } else {
            // Check interval if script is loading but not ready
            let retries = 0;
            const interval = setInterval(() => {
                if (window.gapi) {
                    clearInterval(interval);
                    window.gapi.load('client', async () => {
                        try {
                            await window.gapi.client.init({
                                discoveryDocs: [
                                    "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
                                    "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"
                                ],
                            });
                            this.gapiInited = true;
                            resolve();
                        } catch (err: any) {
                            reject(err);
                        }
                    });
                } else if (retries++ > 20) {
                    clearInterval(interval);
                    reject(new Error("Google API script failed to load"));
                }
            }, 500);
          }
        }), 15000, "Google API initialization timed out");

        await withTimeout(new Promise<void>((resolve, reject) => {
          if (window.google) {
            this.tokenClient = window.google.accounts.oauth2.initTokenClient({
              client_id: this.getClientId(),
              scope: SCOPES,
              callback: '', 
            });
            this.gisInited = true;
            resolve();
          } else {
             let retries = 0;
             const interval = setInterval(() => {
                 if (window.google) {
                     clearInterval(interval);
                     this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                         client_id: this.getClientId(),
                         scope: SCOPES,
                         callback: '',
                     });
                     this.gisInited = true;
                     resolve();
                 } else if (retries++ > 20) {
                     clearInterval(interval);
                     reject(new Error("Google Identity script failed to load"));
                 }
             }, 500);
          }
        }), 15000, "Google Identity initialization timed out");

    } catch (e) {
        console.error("Failed to initialize Google Services:", e);
        throw e;
    }
  }

  private static async validateToken(): Promise<void> {
    await this.init();
    const token = window.gapi.client.getToken();
    if (!token) {
      await this.getToken();
      return;
    }
    // Check if token is expired or missing scopes (basic check)
    const hasScope = window.google.accounts.oauth2.hasGrantedAllScopes(token, SCOPES);
    if (!hasScope) {
      await this.getToken();
    }
  }

  private static async getToken(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tokenClient.callback = (resp: any) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        window.gapi.client.setToken(resp);
        resolve(resp);
      };
      this.tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  private static handleError(error: any): never {
    console.error("Google API Error:", error);
    if (error instanceof Error) throw error;
    
    // Extract message from GAPI error object
    let message = 'Unknown Google API Error';
    if (error) {
        message = error.result?.error?.message || error.message || JSON.stringify(error);
    }
    if (message === '{}') message = 'Unknown error occurred (empty object)';
    
    throw new Error(message);
  }

  // --- DRIVE METHODS ---

  /**
   * Uploads data to Drive with a timestamp in metadata.
   */
  static async backupToDrive(data: any, timestamp: number): Promise<void> {
    try {
      await this.validateToken();

      const fileContent = JSON.stringify(data, null, 2);
      
      let existingFileId = localStorage.getItem(STORAGE_KEY_FILE_ID);
      if (!existingFileId) {
        const existingFile = await this.findBackupFile();
        if (existingFile) existingFileId = existingFile.id;
      }

      const metadata = {
        name: BACKUP_FILENAME,
        mimeType: 'application/json',
        appProperties: {
          lastModified: timestamp.toString()
        }
      };

      const multipartRequestBody =
        `\r\n--foo_bar_baz\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--foo_bar_baz\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        fileContent +
        `\r\n--foo_bar_baz--`;

      if (existingFileId) {
        await window.gapi.client.request({
          path: `https://www.googleapis.com/drive/v3/files/${existingFileId}`,
          method: 'PATCH',
          params: { uploadType: 'multipart' },
          headers: { 'Content-Type': 'multipart/related; boundary=foo_bar_baz' },
          body: multipartRequestBody,
        });
      } else {
        const response = await window.gapi.client.request({
          path: 'https://www.googleapis.com/drive/v3/files',
          method: 'POST',
          params: { uploadType: 'multipart' },
          headers: { 'Content-Type': 'multipart/related; boundary=foo_bar_baz' },
          body: multipartRequestBody,
        });
        if (response.result?.id) {
          localStorage.setItem(STORAGE_KEY_FILE_ID, response.result.id);
        }
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Returns { data, timestamp }
   */
  static async restoreFromDrive(): Promise<{ data: any, timestamp: number }> {
    try {
      await this.validateToken();

      let file = await this.findBackupFile();
      if (!file) {
        throw new Error("No backup file found.");
      }
      
      localStorage.setItem(STORAGE_KEY_FILE_ID, file.id);

      // Get Content
      const response = await window.gapi.client.request({
        path: `https://www.googleapis.com/drive/v3/files/${file.id}`,
        method: 'GET',
        params: { alt: 'media' }
      });

      // Get Metadata for timestamp
      const timestamp = file.appProperties?.lastModified ? parseInt(file.appProperties.lastModified) : 0;

      return { data: response.result, timestamp };
    } catch (error) {
      this.handleError(error);
    }
  }

  static async getRemoteMetadata(): Promise<{ id: string, timestamp: number } | null> {
    try {
      await this.validateToken();
      const file = await this.findBackupFile();
      if (!file) return null;
      return {
        id: file.id,
        timestamp: file.appProperties?.lastModified ? parseInt(file.appProperties.lastModified) : 0
      };
    } catch (error) {
      // If user closes popup or denies access, we might get an error here.
      // We can swallow it and return null to indicate "cannot check remote".
      console.warn("Failed to check remote metadata:", error);
      return null;
    }
  }

  private static async findBackupFile(): Promise<any | null> {
    try {
      const response = await window.gapi.client.request({
        path: 'https://www.googleapis.com/drive/v3/files',
        method: 'GET',
        params: {
           q: `name = '${BACKUP_FILENAME}' and trashed = false`,
           fields: 'files(id, name, appProperties)',
           spaces: 'drive'
        }
      });
      const files = response.result.files;
      if (files && files.length > 0) {
        return files[0];
      }
      return null;
    } catch (error) {
      // Don't throw here, just return null if search fails
      console.error("Error searching Drive files:", error);
      return null;
    }
  }

  // --- CALENDAR METHODS ---

  static async syncTripToCalendar(trip: Trip): Promise<number> {
    try {
      await this.validateToken();
      let eventCount = 0;
      
      const calendarId = 'primary';
      const batch = window.gapi.client.newBatch();

      // 1. Sync Itinerary Events
      Object.entries(trip.itinerary).forEach(([date, items]) => {
          items.forEach(item => {
              if (item.type === 'transport') return; // Skip minor transport details to avoid clutter

              let startDateTime = `${date}T09:00:00`;
              let endDateTime = `${date}T10:00:00`;

              if (item.time) {
                  startDateTime = `${date}T${item.time}:00`;
                  if (item.endTime) {
                      endDateTime = `${date}T${item.endTime}:00`;
                  } else {
                      // Default to 1 hour if no end time
                      const end = new Date(new Date(startDateTime).getTime() + 60*60*1000);
                      endDateTime = end.toISOString().split('.')[0]; // remove ms
                  }
              }

              // Use specific icons for each type. Note: 'transport' is skipped above, so it won't be used here.
              const icon = item.type === 'eating' ? '🍱' : item.type === 'shopping' ? '🛍️' : item.type === 'sightseeing' ? '🏛️' : '📍';
              const event = {
                  'summary': `${icon} ${item.title} (${trip.title})`,
                  'description': item.description || '',
                  'location': trip.location,
                  'start': {
                      'dateTime': startDateTime,
                      'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
                  },
                  'end': {
                      'dateTime': endDateTime,
                      'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
                  }
              };

              const req = window.gapi.client.calendar.events.insert({
                  'calendarId': calendarId,
                  'resource': event
              });
              batch.add(req);
              eventCount++;
          });
      });

      // 2. Sync Flights
      if (trip.flights) {
        Object.entries(trip.flights).forEach(([date, list]) => {
           list.forEach(flight => {
               const event = {
                  'summary': `✈️ Flight ${flight.code} to ${flight.airport}`,
                  'description': `Gate: ${flight.gate}\nTransport: ${flight.transport}`,
                  'start': { 'date': date },
                  'end': { 'date': date }
               };
               const req = window.gapi.client.calendar.events.insert({
                  'calendarId': calendarId,
                  'resource': event
              });
              batch.add(req);
              eventCount++;
           });
        });
      }

      if (eventCount > 0) {
          await batch.then();
      }

      return eventCount;
    } catch (error) {
      this.handleError(error);
      return 0; // Should not reach here due to throw in handleError, but for type safety
    }
  }
}
