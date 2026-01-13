import { auth } from './auth.js';
import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const session = await auth.checkAuth();
    if (!session) return;

    loadTeam();
    setupModal();
    setupForm();

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await auth.logout();
    });

    const profile = await auth.getProfile();
    if (profile) {
        if (profile.perfil === 'engenheiro') {
            window.location.href = 'dashboard.html';
            return;
        }
        document.getElementById('user-name').textContent = profile.nome;
        document.getElementById('user-role').textContent = profile.perfil;
    }
});

let isEditing = false;

// Load Team 
async function loadTeam() {
    const tbody = document.getElementById('team-table-body');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Carregando...</td></tr>';

    // Now selecting name/email directly from 'engenheiros'
    const { data: engineers, error } = await supabase
        .from('engenheiros')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading team:', error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error-color);">Erro ao carregar equipe.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (engineers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum engenheiro cadastrado.</td></tr>';
        return;
    }

    engineers.forEach(eng => {
        // Fallback if migration didn't run yet or data missing
        const name = eng.nome || 'Sem Nome';
        const email = eng.email || '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight: 500;">${name}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">${email}</div>
            </td>
            <td><span style="text-transform: capitalize;">${eng.nivel}</span></td>
            <td>${eng.especialidade || '-'}</td>
            <td>R$ ${(eng.custo_hora_normal || 0).toFixed(2)}</td>
            <td>R$ ${(eng.custo_hora_extra || 0).toFixed(2)}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <div style="width: 50px; background: #e5e7eb; height: 6px; border-radius: 3px; overflow: hidden;">
                        <div style="width: ${eng.disponibilidade}%; background: ${getColorForAvailability(eng.disponibilidade)}; height: 100%;"></div>
                    </div>
                    <span>${eng.disponibilidade}%</span>
                </div>
            </td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="window.editEngineer('${eng.id}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="window.deleteEngineer('${eng.id}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getColorForAvailability(value) {
    if (value >= 80) return 'var(--success-color)';
    if (value >= 50) return 'var(--warning-color)';
    return 'var(--error-color)';
}

// Modal Logic
const modalOverlay = document.getElementById('modal-overlay');
const form = document.getElementById('team-form');

function setupModal() {
    document.getElementById('btn-add-member').addEventListener('click', () => {
        openModal();
    });

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('btn-cancel').addEventListener('click', closeModal);
}

function openModal(engineer = null) {
    modalOverlay.classList.add('open');
    if (engineer) {
        isEditing = true;
        document.getElementById('modal-title').textContent = 'Editar Engenheiro';
        document.getElementById('engineer-id').value = engineer.id;

        document.getElementById('engineer-name').value = engineer.nome || '';
        document.getElementById('engineer-email').value = engineer.email || '';
        document.getElementById('level').value = engineer.nivel;
        document.getElementById('specialty').value = engineer.especialidade;
        document.getElementById('availability').value = engineer.disponibilidade;
        document.getElementById('cost-normal').value = engineer.custo_hora_normal || 0;
        document.getElementById('cost-extra').value = engineer.custo_hora_extra || 0;

    } else {
        isEditing = false;
        document.getElementById('modal-title').textContent = 'Novo Membro da Equipe';
        form.reset();
        document.getElementById('engineer-id').value = '';
    }
}

function closeModal() {
    modalOverlay.classList.remove('open');
}

// Form Submission
function setupForm() {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('engineer-id').value;
        const nome = document.getElementById('engineer-name').value;
        const email = document.getElementById('engineer-email').value;
        const nivel = document.getElementById('level').value;
        const especialidade = document.getElementById('specialty').value;
        const disponibilidade = document.getElementById('availability').value;
        const custo_hora_normal = parseFloat(document.getElementById('cost-normal').value) || 0;
        const custo_hora_extra = parseFloat(document.getElementById('cost-extra').value) || 0;

        // Try to link to an existing user if email matches?
        // Checking if user exists in 'usuarios' table to link usuario_id
        let usuario_id = null;

        const { data: userLink } = await supabase
            .from('usuarios')
            .select('id')
            .eq('email', email)
            .single();

        if (userLink) {
            usuario_id = userLink.id;
        }

        const record = {
            nome,
            email,
            nivel,
            especialidade,
            disponibilidade: parseInt(disponibilidade),
            custo_hora_normal,
            custo_hora_extra,
            usuario_id: usuario_id // Logic to auto-link if possible, or null
        };

        let err;
        if (isEditing && id) {
            // Need to be careful not to overwrite usuario_id with null if it was already set?
            // Actually record.usuario_id will be set if found, or null. 
            // Better strategy: Only update usuario_id if new one found? 
            // Or just update content fields.

            const updateData = { nome, email, nivel, especialidade, disponibilidade, custo_hora_normal, custo_hora_extra };
            // If we found a link, update it, otherwise leave it alone?
            if (usuario_id) updateData.usuario_id = usuario_id;

            const { error } = await supabase.from('engenheiros').update(updateData).eq('id', id);
            err = error;
        } else {
            const { error } = await supabase.from('engenheiros').insert([record]);
            err = error;
        }

        if (err) {
            alert('Erro ao salvar: ' + err.message);
        } else {
            closeModal();
            loadTeam();
        }
    });
}

window.editEngineer = async (id) => {
    const { data, error } = await supabase
        .from('engenheiros')
        .select('*')
        .eq('id', id)
        .single();

    if (!error && data) {
        openModal(data);
    }
};

window.deleteEngineer = async (id) => {
    if (confirm('Tem certeza que deseja remover este membro da equipe?')) {
        const { error } = await supabase
            .from('engenheiros')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Erro ao excluir: ' + error.message);
        } else {
            loadTeam();
        }
    }
};
