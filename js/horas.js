import { auth } from './auth.js';
import { supabase } from './supabaseClient.js';

let currentUser = null;
let currentEngineerId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth Check
    const session = await auth.checkAuth();
    if (!session) return;

    // 2. Load User Profile & Engineer ID
    const profile = await auth.getProfile();
    if (profile) {
        currentUser = profile;
        document.getElementById('user-name').textContent = profile.nome;
        document.getElementById('user-role').textContent = profile.perfil;

        // Fetch Engineer ID linked to this user
        const { data: eng } = await supabase
            .from('engenheiros')
            .select('id')
            .eq('usuario_id', profile.id)
            .single();

        if (eng) {
            currentEngineerId = eng.id;
        }

        // Hide engineer select if not admin/gestor
        if (profile.perfil === 'engenheiro') {
            document.getElementById('engineer-group').style.display = 'none';
        }
    }

    // 3. Setup UI
    document.getElementById('date').valueAsDate = new Date();
    loadProjects();
    loadHistory();
    setupForm();

    // Project Select Change -> Load Activities & Team members
    document.getElementById('project-select').addEventListener('change', () => {
        loadActivities();
        loadProjectTeam();
    });

    document.getElementById('logout-btn').addEventListener('click', () => auth.logout());
});

async function loadProjects() {
    const select = document.getElementById('project-select');
    const { data: projects, error } = await supabase
        .from('projetos')
        .select('id, nome')
        .eq('status', 'em_andamento')
        .order('nome');

    if (projects) {
        projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nome;
            select.appendChild(opt);
        });
    }
}

async function loadProjectTeam() {
    const projectId = document.getElementById('project-select').value;
    const select = document.getElementById('engineer-select');

    select.innerHTML = '<option value="">Selecione...</option>';
    select.disabled = true;

    if (!projectId) return;

    // Fetch allocations for this project
    const { data: allocations } = await supabase
        .from('alocacoes')
        .select(`
            engenheiro_id,
            engenheiros ( id, nome )
        `)
        .eq('projeto_id', projectId);

    if (allocations && allocations.length > 0) {
        select.disabled = false;
        allocations.forEach(al => {
            const eng = al.engenheiros;
            if (eng) {
                const opt = document.createElement('option');
                opt.value = eng.id;
                opt.textContent = eng.nome || 'Engenheiro';
                select.appendChild(opt);
            }
        });

        // Auto-select current user if they are in the team
        if (currentEngineerId) {
            const isInTeam = allocations.some(al => al.engenheiro_id === currentEngineerId);
            if (isInTeam) {
                select.value = currentEngineerId;
            }
        }
    } else {
        select.innerHTML = '<option value="">Sem membros alocados</option>';
    }
}

async function loadActivities() {
    const projectId = document.getElementById('project-select').value;
    const select = document.getElementById('activity-select');

    select.innerHTML = '<option value="">Selecione...</option>';
    select.disabled = true;

    if (!projectId) return;

    const { data: activities } = await supabase
        .from('atividades')
        .select('id, titulo')
        .eq('projeto_id', projectId)
        .in('status', ['todo', 'doing', 'review'])
        .order('titulo');

    if (activities && activities.length > 0) {
        select.disabled = false;
        activities.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.titulo;
            select.appendChild(opt);
        });
    } else {
        select.innerHTML = '<option value="">Sem atividades disponíveis</option>';
    }
}

async function loadHistory() {
    const tbody = document.getElementById('hours-table-body');
    const todayTotalEl = document.getElementById('today-total');

    let query = supabase
        .from('apontamentos_horas')
        .select(`
            id, data, horas, observacao,
            projetos ( nome ),
            atividades ( titulo ),
            engenheiros ( id, nome )
        `)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20);

    // If engineer, show only their hours. If Admin/Gestor, show all.
    if (currentUser?.perfil === 'engenheiro' && currentEngineerId) {
        query = query.eq('engenheiro_id', currentEngineerId);
    }

    const { data, error } = await query;

    if (error) {
        console.error(error);
        return;
    }

    tbody.innerHTML = '';
    let todaySum = 0;
    const todayStr = new Date().toISOString().split('T')[0];

    data.forEach(item => {
        if (item.data === todayStr && item.engenheiro_id === currentEngineerId) {
            todaySum += item.horas;
        }

        const tr = document.createElement('tr');
        const engName = item.engenheiros?.nome || '???';
        const typeLabel = item.tipo_hora === 'extra' ? '<span class="status-badge status-warning">Extra</span>' : '<span class="status-badge status-active">Normal</span>';

        tr.innerHTML = `
            <td>${new Date(item.data).toLocaleDateString()}</td>
            <td>${item.projetos?.nome || '-'}</td>
            <td>${item.atividades?.titulo || '-'}</td>
            <td><strong>${item.horas}h</strong> <br> ${typeLabel}</td>
            <td style="font-size: 0.75rem; color: #666;">${engName.split(' ')[0]}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="window.deleteHour('${item.id}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    todayTotalEl.textContent = todaySum.toFixed(1) + 'h';
}

function setupForm() {
    document.getElementById('hours-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedEngId = document.getElementById('engineer-select').value || currentEngineerId;

        if (!selectedEngId) {
            alert('Erro: É necessário selecionar um responsável (Engenheiro).');
            return;
        }

        const record = {
            engenheiro_id: selectedEngId,
            projeto_id: document.getElementById('project-select').value,
            atividade_id: document.getElementById('activity-select').value || null,
            data: document.getElementById('date').value,
            horas: parseFloat(document.getElementById('hours').value),
            tipo_hora: document.getElementById('hour-type').value,
            observacao: document.getElementById('observation').value
        };

        const { error } = await supabase.from('apontamentos_horas').insert([record]);

        if (error) {
            alert('Erro ao registrar horas: ' + error.message);
        } else {
            document.getElementById('hours').value = '';
            document.getElementById('observation').value = '';
            loadHistory();
        }
    });
}

window.deleteHour = async (id) => {
    if (confirm('Excluir apontamento?')) {
        const { error } = await supabase.from('apontamentos_horas').delete().eq('id', id);
        if (!error) loadHistory();
    }
};
