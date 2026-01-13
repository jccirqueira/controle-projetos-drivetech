import { auth } from './auth.js';
import { supabase } from './supabaseClient.js';

let currentUser = null;
let currentEngineerId = null;
let allTasks = [];
let modal = null;
let form = null;

document.addEventListener('DOMContentLoaded', async () => {
    const session = await auth.checkAuth();
    if (!session) return;

    const profile = await auth.getProfile();
    if (profile) {
        currentUser = profile;
        document.getElementById('user-name').textContent = profile.nome;
        document.getElementById('user-role').textContent = profile.perfil;

        if (profile.perfil === 'engenheiro') {
            const { data: eng } = await supabase
                .from('engenheiros')
                .select('id')
                .eq('usuario_id', profile.id)
                .single();
            if (eng) currentEngineerId = eng.id;
        }
    }

    // Init elements
    modal = document.getElementById('modal-task-overlay');
    form = document.getElementById('task-form');

    // Init data
    await loadFilterOptions();
    await loadBoard();

    // Events
    document.getElementById('project-filter').addEventListener('change', () => loadBoard());
    document.getElementById('btn-add-task').addEventListener('click', () => openTaskModal());
    document.getElementById('modal-task-close').addEventListener('click', () => document.getElementById('modal-task-overlay').classList.remove('open'));
    document.getElementById('logout-btn').addEventListener('click', () => auth.logout());

    setupTaskForm();
    setupProjectTeamFilter();
    exposeDnDGlobals();
});

function setupProjectTeamFilter() {
    const projectSelect = document.getElementById('task-project');
    projectSelect.addEventListener('change', () => {
        const projectId = projectSelect.value;
        loadProjectTeam(projectId);
    });
}

async function loadFilterOptions() {
    // Projects for filter & modal
    const { data: projects } = await supabase.from('projetos').select('id, nome').eq('status', 'em_andamento').order('nome');
    const filterSelect = document.getElementById('project-filter');
    const modalSelect = document.getElementById('task-project');

    if (projects) {
        projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nome;
            filterSelect.appendChild(opt.cloneNode(true));
            modalSelect.appendChild(opt);
        });
    }
}

async function loadProjectTeam(projectId, selectedEngineerId = null) {
    const engSelect = document.getElementById('task-engineer');
    engSelect.innerHTML = '<option value="">Selecione...</option>';

    if (!projectId) return;

    const { data: allocations, error } = await supabase
        .from('alocacoes')
        .select(`
            engenheiro_id,
            engenheiros ( id, nome )
        `)
        .eq('projeto_id', projectId);

    if (error) {
        console.error('Error loading team:', error);
        return;
    }

    if (allocations) {
        allocations.forEach(al => {
            const eng = al.engenheiros;
            if (eng) {
                const opt = document.createElement('option');
                opt.value = eng.id;
                opt.textContent = eng.nome || 'Engenheiro';
                engSelect.appendChild(opt);
            }
        });
    }

    if (selectedEngineerId) {
        engSelect.value = selectedEngineerId;
    }
}

async function loadBoard() {
    const projectId = document.getElementById('project-filter').value;

    let query = supabase
        .from('atividades')
        .select(`
            id, title:titulo, desc:descricao, status, prazo, projeto_id, engenheiro_id, horas_previstas,
            projetos ( nome ),
            engenheiros ( id, nome )
        `)
        .order('updated_at', { ascending: false });

    if (projectId) {
        query = query.eq('projeto_id', projectId);
    }

    // If engineer, show only their tasks
    if (currentUser?.perfil === 'engenheiro' && currentEngineerId) {
        query = query.eq('engenheiro_id', currentEngineerId);
    }

    const { data, error } = await query;
    if (error) {
        console.error(error);
        return;
    }

    allTasks = data;
    renderBoard();
}

function renderBoard() {
    // Clear columns
    ['backlog', 'todo', 'doing', 'review', 'done'].forEach(s => {
        document.getElementById(`col-${s}`).innerHTML = '';
        document.getElementById(`count-${s}`).textContent = '0';
    });

    const counts = { backlog: 0, todo: 0, doing: 0, review: 0, done: 0 };

    allTasks.forEach(task => {
        const col = document.getElementById(`col-${task.status}`);
        if (col) {
            counts[task.status]++;
            const card = createCard(task);
            col.appendChild(card);
        }
    });

    // Update counts
    Object.keys(counts).forEach(k => {
        document.getElementById(`count-${k}`).textContent = counts[k];
    });
}

function createCard(task) {
    const div = document.createElement('div');
    div.className = 'kanban-card priority-normal';
    div.draggable = true;
    div.id = `task-${task.id}`;
    div.ondragstart = (e) => drag(e, task.id);
    div.onclick = (e) => {
        // Prevent edit if clicking a button inside (if we added delete button)
        // For now click whole card to edit
        openTaskModal(task);
    };

    const engineerName = task.engenheiros?.nome || 'Ninguém';
    const projectName = task.projetos?.nome || '';
    const dateStr = task.prazo ? new Date(task.prazo).toLocaleDateString() : '';

    div.innerHTML = `
        <h4 style="margin-bottom: 0.25rem;">${task.title}</h4>
        <div style="font-size: 0.75rem; color: var(--primary-color); font-weight: 500; margin-bottom: 0.5rem;">${projectName}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-secondary);">
            <span><i class="fa-regular fa-user"></i> ${engineerName.split(' ')[0]}</span>
            <span><i class="fa-regular fa-clock"></i> ${task.horas_previstas || 0}h</span>
            <span><i class="fa-regular fa-calendar"></i> ${dateStr}</span>
        </div>
    `;
    return div;
}

// Drag and Drop Logic
function exposeDnDGlobals() {
    window.allowDrop = (ev) => {
        ev.preventDefault();
        const col = ev.target.closest('.kanban-column');
        if (col) col.classList.add('drag-over');
    };

    window.drag = (ev, id) => {
        ev.dataTransfer.setData("text", id);
        ev.target.classList.add('dragging');
    };

    window.drop = async (ev) => {
        ev.preventDefault();
        const taskId = ev.dataTransfer.getData("text");
        const card = document.getElementById(`task-${taskId}`);
        card.classList.remove('dragging');

        const col = ev.target.closest('.kanban-column');
        if (col) {
            col.classList.remove('drag-over');
            const newStatus = col.getAttribute('data-status');

            // Move in UI first for responsiveness
            col.querySelector('.kanban-cards').appendChild(card);

            // Update Supabase
            const { error } = await supabase.from('atividades').update({ status: newStatus }).eq('id', taskId);

            if (error) {
                alert('Erro ao atualizar status: ' + error.message);
                loadBoard(); // Revert
            } else {
                // Update local model
                const task = allTasks.find(t => t.id === taskId);
                if (task) task.status = newStatus;
                renderBoard(); // Re-render to update counts clean
            }
        }
    };

    // Remove drag-over style if leaving
    document.addEventListener('dragleave', (e) => {
        if (e.target.classList.contains('kanban-column')) {
            e.target.classList.remove('drag-over');
        }
    });
}

// Modal Logic
// modal and form initialized in DOMContentLoaded

function setupTaskForm() {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('task-id').value;
        const record = {
            titulo: document.getElementById('task-title').value,
            projeto_id: document.getElementById('task-project').value,
            engenheiro_id: document.getElementById('task-engineer').value || null,
            prazo: document.getElementById('task-deadline').value || null,
            horas_previstas: parseFloat(document.getElementById('task-hours').value) || 0,
            descricao: document.getElementById('task-desc').value,
            status: document.getElementById('task-status').value // preserve status on edit
        };

        if (id) {
            await supabase.from('atividades').update(record).eq('id', id);
        } else {
            record.status = 'backlog'; // New tasks always backlog
            await supabase.from('atividades').insert([record]);
        }

        modal.classList.remove('open');
        loadBoard();
    });
}

async function openTaskModal(task = null) {
    modal.classList.add('open');
    if (task) {
        document.getElementById('modal-task-title').textContent = 'Editar Atividade';
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-project').value = task.projeto_id;

        // Load team for this project and select the engineer
        await loadProjectTeam(task.projeto_id, task.engenheiro_id);

        document.getElementById('task-deadline').value = task.prazo || '';
        document.getElementById('task-hours').value = task.horas_previstas || '';
        document.getElementById('task-desc').value = task.desc || '';
        document.getElementById('task-status').value = task.status;
    } else {
        document.getElementById('modal-task-title').textContent = 'Nova Atividade';
        form.reset();
        document.getElementById('task-id').value = '';
        document.getElementById('task-status').value = 'backlog';
        document.getElementById('task-engineer').innerHTML = '<option value="">Selecione um projeto...</option>';
    }
}
