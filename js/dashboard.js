import { auth } from './auth.js';
import { supabase } from './supabaseClient.js';

let dashboardData = {
    projects: [],
    tasks: [],
    hours: [],
    engineers: []
};

let tasksChart = null;
let hoursChart = null;
let currentUser = null;
let currentEngineerId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!await auth.checkAuth()) return;

    loadUserProfile();
    await initializeDashboard();

    document.getElementById('project-filter').addEventListener('change', () => {
        updateDashboardView();
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await auth.logout();
    });
});

async function loadUserProfile() {
    const profile = await auth.getProfile();
    if (profile) {
        currentUser = profile;
        document.getElementById('user-name').textContent = profile.nome || 'Usuário';
        document.getElementById('user-role').textContent = profile.perfil ? profile.perfil.toUpperCase() : 'N/A';

        if (profile.perfil !== 'engenheiro') {
            document.getElementById('kpi-cost-card').style.display = 'block';
        }

        if (profile.perfil === 'engenheiro') {
            const { data: eng } = await supabase
                .from('engenheiros')
                .select('id')
                .eq('usuario_id', profile.id)
                .single();
            if (eng) currentEngineerId = eng.id;
        }
    }
}

async function initializeDashboard() {
    try {
        await loadUserProfile();

        let pQuery = supabase.from('projetos').select('*, clientes(nome)').order('created_at', { ascending: false });
        let tQuery = supabase.from('atividades').select('*');
        let hQuery = supabase.from('apontamentos_horas').select('*, projetos(nome)');

        // If engineer, restrict data
        if (currentUser?.perfil === 'engenheiro' && currentEngineerId) {
            // 1. Projects where the engineer is allocated
            const { data: allocations } = await supabase
                .from('alocacoes')
                .select('projeto_id')
                .eq('engenheiro_id', currentEngineerId);

            const myProjectIds = (allocations || []).map(a => a.projeto_id);
            pQuery = pQuery.in('id', myProjectIds);

            // 2. Tasks assigned to the engineer
            tQuery = tQuery.eq('engenheiro_id', currentEngineerId);

            // 3. Hours logged by the engineer
            hQuery = hQuery.eq('engenheiro_id', currentEngineerId);
        }

        const [pResp, tResp, hResp, eResp] = await Promise.all([
            pQuery,
            tQuery,
            hQuery,
            supabase.from('engenheiros').select('id, custo_hora_normal, custo_hora_extra')
        ]);

        dashboardData.projects = pResp.data || [];
        dashboardData.tasks = tResp.data || [];
        dashboardData.hours = hResp.data || [];
        dashboardData.engineers = eResp.data || [];

        // Populate filter
        const filter = document.getElementById('project-filter');
        dashboardData.projects.filter(p => p.status === 'em_andamento').forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nome;
            filter.appendChild(opt);
        });

        updateDashboardView();

    } catch (e) {
        console.error('Error initializing dashboard:', e);
    }
}

function updateDashboardView() {
    const filterId = document.getElementById('project-filter').value;

    const filtered = {
        projects: filterId ? dashboardData.projects.filter(p => p.id === filterId) : dashboardData.projects,
        tasks: filterId ? dashboardData.tasks.filter(t => t.projeto_id === filterId) : dashboardData.tasks,
        hours: filterId ? dashboardData.hours.filter(h => h.projeto_id === filterId) : dashboardData.hours
    };

    renderKPIs(filtered, !!filterId);
    renderCharts(filtered, !!filterId);
    renderProjectsTable(dashboardData.projects, dashboardData.hours); // Keep full list in table or filter? Usually full list + highlight. Let's filter if requested, but table says "Recent Projects", so maybe keep it or filter. Let's filter to be consistent.
    renderProjectsTable(filtered.projects.slice(0, 5), dashboardData.hours);
}

function renderKPIs(data, isFiltered) {
    // Project count
    const activeProjects = data.projects.filter(p => p.status === 'em_andamento').length;
    document.getElementById('kpi-projects').textContent = activeProjects;

    // Pending Tasks
    const pending = data.tasks.filter(t => ['backlog', 'todo', 'doing'].includes(t.status)).length;
    document.getElementById('kpi-tasks').textContent = pending;

    // Team
    if (isFiltered) {
        // Count unique engineers assigned to this project via tasks or hours
        const engIds = new Set();
        data.tasks.forEach(t => { if (t.engenheiro_id) engIds.add(t.engenheiro_id); });
        data.hours.forEach(h => { if (h.engenheiro_id) engIds.add(h.engenheiro_id); });
        document.getElementById('kpi-team').textContent = engIds.size;
    } else {
        document.getElementById('kpi-team').textContent = dashboardData.engineers.length;
    }

    // Hours (Current Month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthHours = data.hours
        .filter(h => new Date(h.data) >= startOfMonth)
        .reduce((sum, h) => sum + (h.horas || 0), 0);

    document.getElementById('kpi-hours').textContent = monthHours.toFixed(1);

    // Total Cost (Investment)
    if (currentUser?.perfil !== 'engenheiro') {
        const totalCost = data.hours.reduce((sum, h) => {
            const eng = dashboardData.engineers.find(e => e.id === h.engenheiro_id);
            if (!eng) return sum;
            const rate = h.tipo_hora === 'extra' ? (eng.custo_hora_extra || 0) : (eng.custo_hora_normal || 0);
            return sum + (h.horas * rate);
        }, 0);
        document.getElementById('kpi-cost').textContent = `R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

function renderCharts(data, isFiltered) {
    // 1. Tasks by Status
    const counts = { backlog: 0, todo: 0, doing: 0, review: 0, done: 0 };
    data.tasks.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });

    if (tasksChart) tasksChart.destroy();
    tasksChart = new Chart(document.getElementById('chart-tasks'), {
        type: 'doughnut',
        data: {
            labels: ['Backlog', 'A Fazer', 'Em Andamento', 'Revisão', 'Concluído'],
            datasets: [{
                data: [counts.backlog, counts.todo, counts.doing, counts.review, counts.done],
                backgroundColor: ['#e5e7eb', '#93c5fd', '#3b82f6', '#f59e0b', '#10b981'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });

    // 2. Consumption or Hours over time
    if (hoursChart) hoursChart.destroy();

    let labels = [];
    let spentData = [];
    let estimData = [];

    if (isFiltered) {
        const p = data.projects[0];
        if (p) {
            labels = [p.nome];
            spentData = [data.hours.reduce((sum, h) => sum + (Number(h.horas) || 0), 0)];
            estimData = [Number(p.horas_estimadas) || 0];
        }
    } else {
        // Incluir projetos em andamento e planejamento para visibilidade completa
        let targetProjects = data.projects
            .filter(p => ['em_andamento', 'planejamento'].includes(p.status))
            .slice(0, 7);

        // Se não houver projetos ativos, mostrar os mais recentes de qualquer status
        if (targetProjects.length === 0) targetProjects = data.projects.slice(0, 7);

        labels = targetProjects.map(p => p.nome);
        estimData = targetProjects.map(p => Number(p.horas_estimadas) || 0);
        spentData = targetProjects.map(p => {
            return data.hours
                .filter(h => h.projeto_id === p.id)
                .reduce((sum, h) => sum + (Number(h.horas) || 0), 0);
        });
    }

    hoursChart = new Chart(document.getElementById('chart-hours'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Previsto (h)',
                    data: estimData,
                    backgroundColor: 'rgba(59, 130, 246, 0.5)', // Blue semi-transparent
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Gasto Total (h)',
                    data: spentData,
                    backgroundColor: '#dc2626',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Horas' }
                }
            },
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}

function renderProjectsTable(projects, allHours) {
    const tbody = document.getElementById('projects-table-body');
    tbody.innerHTML = '';

    const spentByProj = {};
    allHours.forEach(h => {
        spentByProj[h.projeto_id] = (spentByProj[h.projeto_id] || 0) + h.horas;
    });

    if (projects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum projeto encontrado.</td></tr>';
        return;
    }

    projects.forEach(proj => {
        const spent = spentByProj[proj.id] || 0;
        const total = proj.horas_estimadas || 0;
        const progress = total > 0 ? Math.min(100, (spent / total) * 100) : 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><a href="projeto-detalhes.html?id=${proj.id}" style="text-decoration: none; color: var(--primary-color); font-weight: 600;">${proj.nome}</a></td>
            <td>${proj.clientes?.nome || 'Sem cliente'}</td>
            <td><span class="status-badge status-${proj.status}">${formatStatus(proj.status)}</span></td>
            <td>${proj.data_fim ? new Date(proj.data_fim).toLocaleDateString() : 'N/A'}</td>
            <td>
                <div style="width: 100%; background: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden;" title="Progresso: ${progress.toFixed(1)}%">
                    <div style="width: ${progress}%; background: var(--primary-color); height: 100%;"></div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function formatStatus(status) {
    const map = {
        'planejamento': 'Planejamento',
        'em_andamento': 'Em Andamento',
        'concluido': 'Concluído',
        'pausado': 'Pausado',
        'cancelado': 'Cancelado'
    };
    return map[status] || status;
}
