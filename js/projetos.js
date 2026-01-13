import { auth } from './auth.js';
import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!await auth.checkAuth()) return;

    loadProjects();
    loadClientsForSelect();
    setupProjectModal();
    setupAllocationModal();

    // Header user info
    auth.getProfile().then(p => {
        if (p) {
            document.getElementById('user-name').textContent = p.nome;
            document.getElementById('user-role').textContent = p.perfil;
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => auth.logout());
});

let isEditingProject = false;

// --- Project CRUD ---

async function loadProjects() {
    const tbody = document.getElementById('projects-table-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Carregando...</td></tr>';

    const { data: projects, error } = await supabase
        .from('projetos')
        .select(`
            id, nome, status, data_inicio, data_fim, horas_estimadas,
            clientes ( nome )
        `)
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--error-color);">Erro ao carregar projetos.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (projects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum projeto encontrado.</td></tr>';
        return;
    }

    projects.forEach(p => {
        const tr = document.createElement('tr');
        const start = p.data_inicio ? new Date(p.data_inicio).toLocaleDateString() : '';
        const end = p.data_fim ? new Date(p.data_fim).toLocaleDateString() : '';
        const period = (start || end) ? `${start} - ${end}` : '-';

        tr.innerHTML = `
            <td><a href="projeto-detalhes.html?id=${p.id}" style="text-decoration: none; color: var(--primary-color); font-weight: 600;">${p.nome}</a></td>
            <td>${p.clientes?.nome || '-'}</td>
            <td><span class="status-badge status-${p.status}">${formatStatus(p.status)}</span></td>
            <td>${p.horas_estimadas || 0}h</td>
            <td style="font-size: 0.85rem;">${period}</td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" onclick="window.editProject('${p.id}')" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="window.manageAllocations('${p.id}', '${p.nome}')" title="Equipe">
                        <i class="fa-solid fa-users-gear"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteProject('${p.id}')" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function loadClientsForSelect() {
    const select = document.getElementById('project-client');
    const { data } = await supabase.from('clientes').select('id, nome').order('nome');
    if (data) {
        data.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nome;
            select.appendChild(opt);
        });
    }
}

// Project Modal
const projectModal = document.getElementById('modal-project-overlay');
const projectForm = document.getElementById('project-form');

function setupProjectModal() {
    document.getElementById('btn-add-project').addEventListener('click', () => openProjectModal());
    document.getElementById('modal-project-close').addEventListener('click', () => projectModal.classList.remove('open'));
    document.getElementById('btn-project-cancel').addEventListener('click', () => projectModal.classList.remove('open'));

    projectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('project-id').value;
        const record = {
            nome: document.getElementById('project-name').value,
            cliente_id: document.getElementById('project-client').value || null,
            status: document.getElementById('project-status').value,
            data_inicio: document.getElementById('project-start').value || null,
            data_fim: document.getElementById('project-end').value || null,
            horas_estimadas: document.getElementById('project-hours').value || null
        };

        let err;
        if (isEditingProject && id) {
            const { error } = await supabase.from('projetos').update(record).eq('id', id);
            err = error;
        } else {
            const { error } = await supabase.from('projetos').insert([record]);
            err = error;
        }

        if (err) alert('Erro: ' + err.message);
        else {
            projectModal.classList.remove('open');
            loadProjects();
        }
    });
}

function openProjectModal(project = null) {
    projectModal.classList.add('open');
    if (project) {
        isEditingProject = true;
        document.getElementById('modal-project-title').textContent = 'Editar Projeto';
        document.getElementById('project-id').value = project.id;
        document.getElementById('project-name').value = project.nome;
        document.getElementById('project-client').value = project.cliente_id || '';
        document.getElementById('project-status').value = project.status;
        document.getElementById('project-start').value = project.data_inicio || '';
        document.getElementById('project-end').value = project.data_fim || '';
        document.getElementById('project-hours').value = project.horas_estimadas || '';
    } else {
        isEditingProject = false;
        document.getElementById('modal-project-title').textContent = 'Novo Projeto';
        projectForm.reset();
        document.getElementById('project-id').value = '';
    }
}

window.editProject = async (id) => {
    const { data } = await supabase.from('projetos').select('*').eq('id', id).single();
    if (data) openProjectModal(data);
};

window.deleteProject = async (id) => {
    if (confirm('Excluir projeto?')) {
        const { error } = await supabase.from('projetos').delete().eq('id', id);
        if (error) alert('Erro: ' + error.message);
        else loadProjects();
    }
};

// --- Allocations ---

const allocModal = document.getElementById('modal-allocation-overlay');
const allocForm = document.getElementById('allocation-form');

function setupAllocationModal() {
    document.getElementById('modal-allocation-close').addEventListener('click', () => allocModal.classList.remove('open'));

    allocForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const projeto_id = document.getElementById('allocation-project-id').value;
        const engenheiro_id = document.getElementById('allocation-engineer').value;
        const percentual = document.getElementById('allocation-percent').value;

        // Create allocation
        const { error } = await supabase.from('alocacoes').insert([{
            projeto_id,
            engenheiro_id,
            percentual
        }]);

        if (error) alert('Erro ao alocar: ' + error.message);
        else {
            loadAllocations(projeto_id);
            allocForm.reset();
            // Restore project id hidden field (reset clears it)
            document.getElementById('allocation-project-id').value = projeto_id;
        }
    });
}

window.manageAllocations = async (projectId, projectName) => {
    allocModal.classList.add('open');
    document.getElementById('allocation-project-name').textContent = projectName;
    document.getElementById('allocation-project-id').value = projectId;

    // Load engineers for dropdown
    const engSelect = document.getElementById('allocation-engineer');
    engSelect.innerHTML = '<option value="">Carregando...</option>';

    const { data: engs } = await supabase
        .from('engenheiros')
        .select('id, nome')
        .order('nome');

    engSelect.innerHTML = '<option value="">Selecione...</option>';
    if (engs) {
        engs.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.nome || 'Engenheiro sem nome';
            engSelect.appendChild(opt);
        });
    }

    // Live preview of hours
    const { data: project } = await supabase.from('projetos').select('horas_estimadas').eq('id', projectId).single();
    const projectHours = project?.horas_estimadas || 0;
    const percentInput = document.getElementById('allocation-percent');
    const preview = document.getElementById('allocation-hours-preview');

    const updatePreview = () => {
        const val = parseInt(percentInput.value) || 0;
        preview.textContent = `= ${(projectHours * val / 100).toFixed(1)}h`;
    };
    percentInput.addEventListener('input', updatePreview);
    updatePreview();

    loadAllocations(projectId);
};

async function loadAllocations(projectId) {
    const tbody = document.getElementById('allocation-table-body');
    tbody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';

    const { data: project } = await supabase.from('projetos').select('horas_estimadas').eq('id', projectId).single();
    const projectHours = project?.horas_estimadas || 0;

    const { data, error } = await supabase
        .from('alocacoes')
        .select(`
            id, percentual,
            engenheiros ( id, nome )
        `)
        .eq('projeto_id', projectId);

    tbody.innerHTML = '';
    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary);">Nenhuma equipe alocada.</td></tr>';
        return;
    }

    data.forEach(a => {
        const calculatedHours = (projectHours * (a.percentual || 0)) / 100;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${a.engenheiros?.nome || '-'}</td>
            <td>${a.percentual}%</td>
            <td style="font-weight: 600; color: var(--primary-color);">${calculatedHours.toFixed(1)}h</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="window.removeAllocation('${a.id}', '${projectId}')">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.removeAllocation = async (id, projectId) => {
    if (confirm('Remover membro da equipe?')) {
        const { error } = await supabase.from('alocacoes').delete().eq('id', id);
        if (!error) loadAllocations(projectId);
    }
};

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
