
export interface n8nReportResponse {
    timestamp: string;
    totalProcessed: number;
    overallEfficiency: number; // 0-100 score
    error?: string;
    warnings?: string[];
    debug?: string;
    operators: {
        name: string;
        totalIssues: number;
        efficiency: number;
        byMachine: Record<string, number>;
    }[];
    machines: {
        name: string;
        totalIssues: number;
    }[];
    processTypeBreakdown: Record<string, number>;
    defectDistribution: { name: string; value: number }[]; // For Pie Chart
    timelineData: { name: string; issues: number }[]; // For Bar/Line Chart (daily/shift)
}

class N8nService {
    private apiUrl = 'https://danielkingraf-ux.app.n8n.cloud/webhook/ods-import';

    async processHistoricalData(file: File): Promise<n8nReportResponse> {
        const formData = new FormData();
        formData.append('data', file);

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            let errorMsg = `Erro ${response.status}: ${response.statusText}`;
            try {
                const errorBody = await response.json();
                if (errorBody.message) errorMsg += ` - ${errorBody.message}`;
            } catch (e) {
                // Ignore json parse error
            }
            throw new Error(errorMsg);
        }

        return await response.json();
    }
}

export const n8nService = new N8nService();
