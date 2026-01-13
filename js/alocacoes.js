import { auth } from './auth.js';
import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const session = await auth.checkAuth();
    if (!session) return;

    loadUserProfile();
    loadAllocations();

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await auth.logout();
    });
});

async function loadUserProfile() {
    const profile = await auth.getProfile();
    if (profile) {
        if (profile.perfil === 'engenheiro') {
            window.location.href = 'dashboard.html';
            return;
        }
        document.getElementById('user-name').textContent = profile.nome;
        document.getElementById('user-role').textContent = profile.perfil;
    }
}

async function loadAllocations() {
    const tbody = document.getElementById('allocation-table-body');

    try {
        // Fetch engineers and their current allocations
        const [engResp, alocResp] = await Promise.all([
            supabase.from('engenheiros').select('*'),
            supabase.from('alocacoes').select(`
                *,
                projetos ( id, nome, status )
            `)
        ]);

        const engineers = engResp.data || [];
        const allocations = alocResp.data || [];

        // Aggregate allocations by engineer
        const engData = engineers.map(eng => {
            const myAllocations = allocations.filter(a =>
                a.engenheiro_id === eng.id &&
                a.projetos?.status === 'em_andamento'
            );

            const totalAllocated = myAllocations.reduce((sum, a) => sum + (a.percentual || 0), 0);

            return {
                ...eng,
                totalAllocated,
                projects: myAllocations.map(a => a.projetos.nome)
            };
        });

        // Update KPIs
        const overloaded = engData.filter(e => e.totalAllocated > 100).length;
        document.getElementById('kpi-overloaded').textContent = overloaded;

        const totalPotential = engineers.length * 100;
        const totalUsed = engData.reduce((sum, e) => sum + e.totalAllocated, 0);
        const utilization = totalPotential > 0 ? (totalUsed / totalPotential) * 100 : 0;
        document.getElementById('kpi-utilization').textContent = utilization.toFixed(1) + '%';

        // Render Table
        tbody.innerHTML = '';
        engData.sort((a, b) => b.totalAllocated - a.totalAllocated).forEach(eng => {
            const tr = document.createElement('tr');

            let statusBadge = '';
            if (eng.totalAllocated > 100) {
                statusBadge = '<span class="status-badge status-danger">Sobrecarga</span>';
            } else if (eng.totalAllocated >= 80) {
                statusBadge = '<span class="status-badge status-warning">Limite</span>';
            } else if (eng.totalAllocated > 0) {
                statusBadge = '<span class="status-badge status-em_andamento">Ativo</span>';
            } else {
                statusBadge = '<span class="status-badge">Disponível</span>';
            }

            tr.innerHTML = `
                <td>
                    <div style="font-weight: 600;">${eng.nome}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${eng.especialidade}</div>
                </td>
                <td><span style="text-transform: capitalize;">${eng.nivel}</span></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="flex: 1; min-width: 100px; background: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden;">
                            <div style="width: ${Math.min(100, eng.totalAllocated)}%; background: ${getColorForLoad(eng.totalAllocated)}; height: 100%;"></div>
                        </div>
                        <span style="font-weight: 600; color: ${getColorForLoad(eng.totalAllocated)}">${eng.totalAllocated}%</span>
                    </div>
                </td>
                <td style="font-size: 0.875rem;">
                    ${eng.projects.length > 0 ? eng.projects.join(', ') : '<span style="color: var(--text-secondary);">Nenhum</span>'}
                </td>
                <td>${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error('Error loading allocations:', e);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error-color);">Erro ao carregar dados.</td></tr>';
    }
}

function getColorForLoad(value) {
    if (value > 100) return 'var(--error-color)';
    if (value >= 80) return 'var(--warning-color)';
    if (value > 0) return 'var(--success-color)';
    return 'var(--text-secondary)';
}
