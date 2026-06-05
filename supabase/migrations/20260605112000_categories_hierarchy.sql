-- PRINTFLOWPRO - Adicionar hierarquia de categorias (Pai e Filho)
-- Permite que uma categoria tenha uma categoria pai vinculada, estruturando subcategorias.

ALTER TABLE public.categories 
  ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES public.categories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories(parent_id);
