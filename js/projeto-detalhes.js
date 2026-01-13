import { auth } from './auth.js';
import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!await auth.checkAuth()) return;

    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('id');

    if (!projectId) {
        window.location.href = 'dashboard.html';
        return;
    }

    const profile = await auth.getProfile();
    let currentEngineerId = null;

    if (profile) {
        document.getElementById('user-name').textContent = profile.nome;
        document.getElementById('user-role').textContent = profile.perfil;

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

    document.getElementById('logout-btn').addEventListener('click', () => auth.logout());

    loadProjectDashboard(projectId, profile, currentEngineerId);
});

async function loadProjectDashboard(projectId, profile, currentEngineerId) {
    try {
        // 1. Fetch Project Info
        const { data: project, error: pErr } = await supabase
            .from('projetos')
            .select('*, clientes(nome)')
            .eq('id', projectId)
            .single();

        if (pErr || !project) {
            alert('Projeto não encontrado');
            window.location.href = 'projetos.html';
            return;
        }

        renderProjectHeader(project);

        // 2. Fetch Activities for this project
        let aQuery = supabase
            .from('atividades')
            .select('*, engenheiros(id, nome)')
            .eq('projeto_id', projectId);

        // 3. Fetch Hours for this project
        let hQuery = supabase
            .from('apontamentos_horas')
            .select('*, engenheiros(id, nome, custo_hora_normal, custo_hora_extra)')
            .eq('projeto_id', projectId);

        // If engineer, restrict data to their own
        if (profile?.perfil === 'engenheiro' && currentEngineerId) {
            aQuery = aQuery.eq('engenheiro_id', currentEngineerId);
            hQuery = hQuery.eq('engenheiro_id', currentEngineerId);
        }

        // 4. Fetch Team (Allocations) - Everyone can see who is in the team
        const { data: allocations, error: alErr } = await supabase
            .from('alocacoes')
            .select('*, engenheiros(id, nome)')
            .eq('projeto_id', projectId);

        const [aResp, hResp] = await Promise.all([aQuery, hQuery]);
        const activities = aResp.data;
        const hoursRecords = hResp.data;
        const aErr = aResp.error;
        const hErr = hResp.error;

        if (aErr || hErr || alErr) {
            console.error('Error fetching dashboard data:', { aErr, hErr, alErr });
        }

        renderKPIS(project, activities, hoursRecords, allocations);
        renderCharts(activities, hoursRecords);
        renderTables(activities, hoursRecords, allocations);

    } catch (e) {
        console.error('Unexpected error:', e);
    }
}

function renderProjectHeader(project) {
    document.getElementById('project-name-header').textContent = project.nome;
    document.getElementById('project-client-header').textContent = project.clientes?.nome || 'Sem cliente';

    const start = project.data_inicio ? new Date(project.data_inicio).toLocaleDateString() : 'N/A';
    const end = project.data_fim ? new Date(project.data_fim).toLocaleDateString() : 'N/A';
    document.getElementById('project-period').textContent = `Período: ${start} - ${end}`;

    const badge = document.getElementById('project-status-badge');
    badge.textContent = project.status.replace('_', ' ').toUpperCase();
    badge.className = `status-badge status-${project.status}`;
}

function renderKPIS(project, activities, hoursRecords, allocations) {
    // Hours
    const spent = (hoursRecords || []).reduce((sum, r) => sum + (r.horas || 0), 0);
    const total = project.horas_estimadas || 0;
    const percent = total > 0 ? Math.min(100, (spent / total) * 100).toFixed(1) : 0;

    document.getElementById('kpi-hours-spent').textContent = spent.toFixed(1);
    document.getElementById('kpi-hours-total').textContent = total;
    document.getElementById('kpi-hours-percent').textContent = `${percent}%`;

    // Cost
    if (document.getElementById('kpi-cost-card').style.display !== 'none') {
        const totalCost = (hoursRecords || []).reduce((sum, h) => {
            const eng = h.engenheiros;
            if (!eng) return sum;
            const rate = h.tipo_hora === 'extra' ? (eng.custo_hora_extra || 0) : (eng.custo_hora_normal || 0);
            return sum + (h.horas * rate);
        }, 0);
        document.getElementById('kpi-cost').textContent = `R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Tasks
    const totalTasks = (activities || []).length;
    const doneTasks = (activities || []).filter(a => a.status === 'done').length;
    document.getElementById('kpi-tasks-done').textContent = `${doneTasks} / ${totalTasks}`;

    // Team
    document.getElementById('kpi-team-count').textContent = (allocations || []).length;
}

function renderCharts(activities, hoursRecords) {
    // 1. Task Status Distribution (Doughnut)
    const statusCounts = { backlog: 0, todo: 0, doing: 0, review: 0, done: 0 };
    (activities || []).forEach(a => {
        if (statusCounts[a.status] !== undefined) statusCounts[a.status]++;
    });

    new Chart(document.getElementById('chart-tasks-status'), {
        type: 'doughnut',
        data: {
            labels: ['Backlog', 'A Fazer', 'Em Andamento', 'Revisão', 'Concluído'],
            datasets: [{
                data: [statusCounts.backlog, statusCounts.todo, statusCounts.doing, statusCounts.review, statusCounts.done],
                backgroundColor: ['#e5e7eb', '#93c5fd', '#3b82f6', '#f59e0b', '#10b981'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // 2. Effort per Member (Bar)
    const engHours = {};
    (hoursRecords || []).forEach(h => {
        const name = h.engenheiros?.nome || 'N/A';
        engHours[name] = (engHours[name] || 0) + (h.horas || 0);
    });

    const labels = Object.keys(engHours);
    const data = Object.values(engHours);

    new Chart(document.getElementById('chart-hours-engineer'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Horas Apontadas',
                data: data,
                backgroundColor: '#dc2626',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function renderTables(activities, hoursRecords, allocations) {
    // Team Table
    const teamBody = document.getElementById('team-table-body');
    teamBody.innerHTML = '';

    const engHours = {};
    (hoursRecords || []).forEach(h => {
        const id = h.engenheiro_id;
        engHours[id] = (engHours[id] || 0) + (h.horas || 0);
    });

    if (!allocations || allocations.length === 0) {
        teamBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Ninguém alocado.</td></tr>';
    } else {
        allocations.forEach(al => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${al.engenheiros?.nome || 'N/A'}</td>
                <td>${al.percentual}%</td>
                <td>${(engHours[al.engenheiro_id] || 0).toFixed(1)}h</td>
            `;
            teamBody.appendChild(tr);
        });
    }

    // Recent Tasks Table
    const tasksBody = document.getElementById('tasks-table-body');
    tasksBody.innerHTML = '';

    if (!activities || activities.length === 0) {
        tasksBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhuma atividade.</td></tr>';
    } else {
        activities.slice(0, 5).forEach(a => {
            const tr = document.createElement('tr');
            const date = a.prazo ? new Date(a.prazo).toLocaleDateString() : '-';
            tr.innerHTML = `
                <td>${a.titulo}</td>
                <td>${a.engenheiros?.nome || 'Ninguém'}</td>
                <td><span class="status-badge status-${a.status}">${formatStatus(a.status)}</span></td>
                <td>${date}</td>
            `;
            tasksBody.appendChild(tr);
        });
    }
}

function formatStatus(status) {
    const map = {
        'backlog': 'Backlog',
        'todo': 'A Fazer',
        'doing': 'Em Andamento',
        'review': 'Revisão',
        'done': 'Concluído',
        'planejamento': 'Planejamento',
        'em_andamento': 'Em Andamento',
        'concluido': 'Concluído',
        'pausado': 'Pausado',
        'cancelado': 'Cancelado'
    };
    return map[status] || status;
}
