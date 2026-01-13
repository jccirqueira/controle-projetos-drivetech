import { auth } from './auth.js';
import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const session = await auth.checkAuth();
    if (!session) return;

    loadClients();
    setupModal();
    setupForm();

    // Logout
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

// Load Clients
async function loadClients() {
    const tbody = document.getElementById('clients-table-body');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Carregando...</td></tr>';

    const { data: clients, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nome');

    if (error) {
        console.error('Error loading clients:', error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error-color);">Erro ao carregar clientes.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum cliente cadastrado.</td></tr>';
        return;
    }

    clients.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${c.nome}</strong></td>
            <td>${c.cnpj || '-'}</td>
            <td>${c.contato || '-'}</td>
            <td>${c.email || '-'}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="window.editClient('${c.id}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="window.deleteClient('${c.id}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Modal Logic
const modalOverlay = document.getElementById('modal-overlay');
const form = document.getElementById('client-form');

function setupModal() {
    document.getElementById('btn-add-client').addEventListener('click', () => {
        openModal();
    });

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('btn-cancel').addEventListener('click', closeModal);
}

function openModal(client = null) {
    modalOverlay.classList.add('open');
    if (client) {
        isEditing = true;
        document.getElementById('modal-title').textContent = 'Editar Cliente';
        document.getElementById('client-id').value = client.id;
        document.getElementById('name').value = client.nome;
        document.getElementById('cnpj').value = client.cnpj || '';
        document.getElementById('contact').value = client.contato || '';
        document.getElementById('email').value = client.email || '';
    } else {
        isEditing = false;
        document.getElementById('modal-title').textContent = 'Novo Cliente';
        form.reset();
        document.getElementById('client-id').value = '';
    }
}

function closeModal() {
    modalOverlay.classList.remove('open');
}

// Form Submission
function setupForm() {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('client-id').value;
        const nome = document.getElementById('name').value;
        const cnpj = document.getElementById('cnpj').value;
        const contato = document.getElementById('contact').value;
        const email = document.getElementById('email').value;

        const record = { nome, cnpj, contato, email };

        let err;
        if (isEditing && id) {
            const { error } = await supabase
                .from('clientes')
                .update(record)
                .eq('id', id);
            err = error;
        } else {
            const { error } = await supabase
                .from('clientes')
                .insert([record]);
            err = error;
        }

        if (err) {
            alert('Erro ao salvar: ' + err.message);
        } else {
            closeModal();
            loadClients();
        }
    });
}

// Global functions
window.editClient = async (id) => {
    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', id)
        .single();

    if (!error && data) {
        openModal(data);
    }
};

window.deleteClient = async (id) => {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
        const { error } = await supabase
            .from('clientes')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Erro ao excluir: ' + error.message);
        } else {
            loadClients();
        }
    }
};
