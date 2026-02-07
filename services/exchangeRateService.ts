
export class ExchangeRateService {
  private static API_KEY = '9ec549080af7338108c79c52';
  private static BASE_URL = 'https://v6.exchangerate-api.com/v6';

  static async getRate(from: string, to: string): Promise<number | null> {
    try {
      if (from === to) return 1;
      const response = await fetch(`${this.BASE_URL}/${this.API_KEY}/pair/${from}/${to}`);
      if (!response.ok) {
        console.warn(`Exchange rate fetch failed: ${response.statusText}`);
        return null;
      }
      const data = await response.json();
      if (data.result === 'success') {
        return data.conversion_rate;
      }
      return null;
    } catch (error) {
      console.error("Exchange Rate Service Error:", error);
      return null;
    }
  }
}
