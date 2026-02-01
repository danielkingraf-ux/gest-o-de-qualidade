import axios from 'axios';
import fs from 'fs';

const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3N2M1MTMxNi03MmQ4LTRhM2YtYjM0MC0wNTljMjZkNWE4Y2EiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6IjliZjI5NTBjLWFhYWMtNGJlMi04OTk3LTVlNDAzMGyYTk1YyIsImlhdCI6MTc2OTg3MjU1Mn0.vb6-e7Kb6qQapYU_drdfY-uDzxMTp0kaQ1PfKC-O1hEERE";
const baseUrl = "https://danielkingraf-ux.app.n8n.cloud/api/v1";

async function createWorkflow() {
    if (!fs.existsSync('ods_workflow.json')) {
        console.error('Error: ods_workflow.json not found!');
        process.exit(1);
    }

    try {
        const workflowData = JSON.parse(fs.readFileSync('ods_workflow.json', 'utf8'));

        const response = await axios.post(`${baseUrl}/workflows`, {
            name: "ODS Import - Gestão de Qualidade",
            nodes: workflowData.nodes,
            connections: workflowData.connections,
            active: true
        }, {
            headers: {
                'X-N8N-API-KEY': apiKey,
                'Content-Type': 'application/json'
            }
        });

        console.log('Workflow created successfully:', response.data.id);
    } catch (error) {
        if (error.response) {
            console.error('Error Status:', error.response.status);
            console.error('Error Data:', error.response.data);
        } else {
            console.error('Error Message:', error.message);
        }
        process.exit(1);
    }
}

createWorkflow();
