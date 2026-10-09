-- Ordenação estável e seek da etapa 11A: o índice composto atende
-- created_at DESC, id DESC e o limite superior/inferior do cursor.
CREATE INDEX IF NOT EXISTS idx_formulas_created_id ON formulas(created_at, id);
