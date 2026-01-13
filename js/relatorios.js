import { auth } from './auth.js';
import { supabase } from './supabaseClient.js';

let reportData = [];

document.addEventListener('DOMContentLoaded', async () => {
    const session = await auth.checkAuth();
    if (!session) return;

    const profile = await auth.getProfile();
    let currentEngineerId = null;

    if (profile) {
        document.getElementById('user-name').textContent = profile.nome;
        document.getElementById('user-role').textContent = profile.perfil.toUpperCase();

        if (profile.perfil === 'engenheiro') {
            const { data: eng } = await supabase
                .from('engenheiros')
                .select('id')
                .eq('usuario_id', profile.id)
                .single();
            if (eng) currentEngineerId = eng.id;
        }
    }

    // Default dates (current month)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    document.getElementById('filter-start').value = firstDay;
    document.getElementById('filter-end').value = lastDay;

    await loadFilterOptions(profile, currentEngineerId);

    // Initial Load
    await fetchReportData(profile, currentEngineerId);

    document.getElementById('print-date').textContent = new Date().toLocaleString();

    // Events
    document.getElementById('filter-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await fetchReportData();
    });

    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
    document.getElementById('btn-print').addEventListener('click', () => window.print());
    document.getElementById('logout-btn').addEventListener('click', () => auth.logout());
});

async function loadFilterOptions(profile, currentEngineerId) {
    // Projects
    let projectQuery = supabase.from('projetos').select('id, nome').order('nome');

    // If engineer, show only projects they are involved in (allocated)
    if (profile?.perfil === 'engenheiro' && currentEngineerId) {
        const { data: allocations } = await supabase
            .from('alocacoes')
            .select('projeto_id')
            .eq('engenheiro_id', currentEngineerId);

        const myProjectIds = (allocations || []).map(a => a.projeto_id);
        projectQuery = projectQuery.in('id', myProjectIds);
    }

    const { data: projects } = await projectQuery;
    const pSelect = document.getElementById('filter-project');
    if (projects) {
        projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nome;
            pSelect.appendChild(opt);
        });
    }

    // Engineers
    const eSelect = document.getElementById('filter-engineer');
    if (profile?.perfil === 'engenheiro' && currentEngineerId) {
        // Find the current engineer record to get their name
        const { data: eng } = await supabase.from('engenheiros').select('nome').eq('id', currentEngineerId).single();
        eSelect.innerHTML = `<option value="${currentEngineerId}">${eng?.nome || 'Eu'}</option>`;
        eSelect.disabled = true;
    } else {
        const { data: engineers } = await supabase.from('engenheiros').select('id, nome').order('nome');
        if (engineers) {
            engineers.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = e.nome;
                eSelect.appendChild(opt);
            });
        }
    }
}

async function fetchReportData(profile, currentEngineerId) {
    const start = document.getElementById('filter-start').value;
    const end = document.getElementById('filter-end').value;
    const projectId = document.getElementById('filter-project').value;
    const engineerId = document.getElementById('filter-engineer').value || (profile?.perfil === 'engenheiro' ? currentEngineerId : null);

    let query = supabase
        .from('apontamentos_horas')
        .select(`
            id, data, horas, observacao,
            projetos ( nome ),
            engenheiros ( nome ),
            atividades ( titulo )
        `)
        .gte('data', start)
        .lte('data', end)
        .order('data', { ascending: true });

    if (projectId) query = query.eq('projeto_id', projectId);

    // Enforcement: Engineers can ONLY see their own records
    if (profile?.perfil === 'engenheiro' && currentEngineerId) {
        query = query.eq('engenheiro_id', currentEngineerId);
    } else if (engineerId) {
        query = query.eq('engenheiro_id', engineerId);
    }

    // Update print period text
    document.getElementById('print-period').textContent = `Período: ${new Date(start + 'T00:00:00').toLocaleDateString()} a ${new Date(end + 'T00:00:00').toLocaleDateString()}`;

    const { data, error } = await query;

    if (error) {
        console.error(error);
        return;
    }

    reportData = data;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('report-table-body');
    const tfoot = document.getElementById('report-table-foot');
    tbody.innerHTML = '';

    if (reportData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum dado encontrado para os filtros selecionados.</td></tr>';
        tfoot.innerHTML = '';
        return;
    }

    let totalHours = 0;

    reportData.forEach(row => {
        totalHours += row.horas;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(row.data).toLocaleDateString()}</td>
            <td>${row.projetos?.nome || '-'}</td>
            <td>${row.engenheiros?.nome || '-'}</td>
            <td>${row.atividades?.titulo || '-'}</td>
            <td>${row.horas.toFixed(1)}h</td>
            <td style="font-size: 0.8rem; color: var(--text-secondary);">${row.observacao || '-'}</td>
        `;
        tbody.appendChild(tr);
    });

    tfoot.innerHTML = `
        <tr>
            <td colspan="4" style="text-align: right;">TOTAL:</td>
            <td>${totalHours.toFixed(1)}h</td>
            <td></td>
        </tr>
    `;
}

function exportCSV() {
    if (reportData.length === 0) return;

    // Header
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Data;Projeto;Engenheiro;Atividade;Horas;Observacao\n";

    // Data
    reportData.forEach(row => {
        const line = [
            row.data,
            row.projetos?.nome || '',
            row.engenheiros?.nome || '',
            row.atividades?.titulo || '',
            row.horas.toString().replace('.', ','),
            `"${(row.observacao || '').replace(/"/g, '""')}"`
        ];
        csvContent += line.join(";") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_horas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
