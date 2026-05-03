export interface OdsSheetStats {
  sheet: string;
  stats: {
    rows: number;
    columns: number;
    non_null_counts: Record<string, number>;
    numeric_means: Record<string, number>;
  };
}

export interface OdsReport {
  file: {
    name: string;
    size_bytes: number;
  };
  summary: {
    total_sheets: number;
    total_rows: number;
    total_columns: number;
  };
  sheets: OdsSheetStats[];
}

export type OdsReportResponse = OdsReport | { error: string };

const DEFAULT_ENDPOINT = 'http://localhost:5000/ods/upload';
const ENDPOINT = (import.meta as any).env?.VITE_ODS_API_URL || DEFAULT_ENDPOINT;

class OdsService {
  async processHistoricalData(file: File): Promise<OdsReportResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      try {
        const err = await response.json();
        return { error: err?.error || `HTTP ${response.status}` };
      } catch {
        return { error: `HTTP ${response.status}` };
      }
    }

    return response.json();
  }
}

export const odsService = new OdsService();
