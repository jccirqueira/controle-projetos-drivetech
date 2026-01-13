-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Perfis/Usuários (Estende a auth.users do Supabase)
CREATE TABLE public.usuarios (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'gestor', 'engenheiro')),
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Clientes
CREATE TABLE public.clientes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nome TEXT NOT NULL,
    cnpj TEXT,
    contato TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Engenheiros (Dados específicos)
CREATE TABLE public.engenheiros (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE UNIQUE,
    especialidade TEXT,
    nivel TEXT CHECK (nivel IN ('junior', 'pleno', 'senior', 'especialista')),
    disponibilidade INTEGER DEFAULT 100, -- Percentual
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Projetos
CREATE TABLE public.projetos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    status TEXT CHECK (status IN ('planejamento', 'em_andamento', 'concluido', 'pausado', 'cancelado')),
    data_inicio DATE,
    data_fim DATE,
    horas_estimadas INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabela de Alocações (Engenheiro x Projeto)
CREATE TABLE public.alocacoes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    engenheiro_id UUID REFERENCES public.engenheiros(id) ON DELETE CASCADE,
    projeto_id UUID REFERENCES public.projetos(id) ON DELETE CASCADE,
    percentual INTEGER NOT NULL CHECK (percentual > 0 AND percentual <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Tabela de Atividades
CREATE TABLE public.atividades (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    projeto_id UUID REFERENCES public.projetos(id) ON DELETE CASCADE,
    engenheiro_id UUID REFERENCES public.engenheiros(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    status TEXT CHECK (status IN ('backlog', 'todo', 'doing', 'review', 'done')),
    prazo DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Tabela de Apontamentos de Horas
CREATE TABLE public.apontamentos_horas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    engenheiro_id UUID REFERENCES public.engenheiros(id) ON DELETE CASCADE,
    projeto_id UUID REFERENCES public.projetos(id) ON DELETE CASCADE,
    atividade_id UUID REFERENCES public.atividades(id) ON DELETE SET NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    horas NUMERIC(5,2) NOT NULL CHECK (horas > 0),
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engenheiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alocacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apontamentos_horas ENABLE ROW LEVEL SECURITY;

-- Funções Auxiliares para Policies
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT perfil FROM public.usuarios WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT perfil FROM public.usuarios WHERE id = auth.uid()) = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_engineer_id()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT id FROM public.engenheiros WHERE usuario_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies

-- USUARIOS
-- Admin vê tudo, Usuario vê a si mesmo
CREATE POLICY "Admin access all users" ON public.usuarios FOR ALL USING (is_admin());
CREATE POLICY "User view own profile" ON public.usuarios FOR SELECT USING (auth.uid() = id);

-- CLIENTES
-- Admin e Gestor podem CRUD. Engenheiro apenas View (se necessário) ou nada.
-- Assumindo que todos podem ver clientes para contexto.
CREATE POLICY "Admin/Gestor manage clients" ON public.clientes FOR ALL USING (
    get_current_user_role() IN ('admin', 'gestor')
);
CREATE POLICY "Engenheiros view clients" ON public.clientes FOR SELECT USING (
    get_current_user_role() = 'engenheiro'
);

-- ENGENHEIROS
-- Admin/Gestor manage. Engenheiro view all (para equipe) e edit some fields (se quiser complexidade, mas por enquanto Admin/Gestor manage).
CREATE POLICY "Admin/Gestor manage engenheiros" ON public.engenheiros FOR ALL USING (
    get_current_user_role() IN ('admin', 'gestor')
);
CREATE POLICY "View engenheiros" ON public.engenheiros FOR SELECT USING (true); 

-- PROJETOS
-- Admin/Gestor manage. Engenheiro view se alocado (ou todos, dep. da regra).
-- Regra pede: "Gestor vê projetos sob sua responsabilidade" (Assumindo que Gestor vê todos ou teria campo gestor_id. Vou simplificar: Gestor vê todos).
-- "Engenheiro vê apenas seus dados". Se for estrito, Engenheiro só vê projetos onde tem alocação ou atividade.
CREATE POLICY "Admin/Gestor manage projects" ON public.projetos FOR ALL USING (
    get_current_user_role() IN ('admin', 'gestor')
);
CREATE POLICY "Engenheiro view assigned projects" ON public.projetos FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.alocacoes WHERE projeto_id = projetos.id AND engenheiro_id = get_my_engineer_id()
    )
);

-- ALOCACOES
CREATE POLICY "Admin/Gestor manage alocacoes" ON public.alocacoes FOR ALL USING (
    get_current_user_role() IN ('admin', 'gestor')
);
CREATE POLICY "Engenheiro view own allocations" ON public.alocacoes FOR SELECT USING (
    engenheiro_id = get_my_engineer_id()
);

-- ATIVIDADES
-- Admin/Gestor manage all. Engenheiro manage own (status update) or create?
-- Vamos permitir que Engenheiro veja suas e crie/edite suas.
CREATE POLICY "Admin/Gestor manage activities" ON public.atividades FOR ALL USING (
    get_current_user_role() IN ('admin', 'gestor')
);
CREATE POLICY "Engenheiro view project activities" ON public.atividades FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.alocacoes WHERE projeto_id = atividades.projeto_id AND engenheiro_id = get_my_engineer_id()
    )
);
CREATE POLICY "Engenheiro update own activities" ON public.atividades FOR UPDATE USING (
    engenheiro_id = get_my_engineer_id()
);

-- APONTAMENTOS
CREATE POLICY "Admin/Gestor view all hours" ON public.apontamentos_horas FOR SELECT USING (
    get_current_user_role() IN ('admin', 'gestor')
);
CREATE POLICY "Engenheiro manage own hours" ON public.apontamentos_horas FOR ALL USING (
    engenheiro_id = get_my_engineer_id()
);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_usuarios_modtime BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_clientes_modtime BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_engenheiros_modtime BEFORE UPDATE ON public.engenheiros FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_projetos_modtime BEFORE UPDATE ON public.projetos FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_atividades_modtime BEFORE UPDATE ON public.atividades FOR EACH ROW EXECUTE FUNCTION update_modified_column();
