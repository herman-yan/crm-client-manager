-- 修复 logs 表：添加 person 列（跟进人）
-- 在 Supabase Dashboard → SQL Editor 中运行

ALTER TABLE logs ADD COLUMN IF NOT EXISTS person TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS date_sort TEXT;

-- 确认列已添加
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'logs' 
ORDER BY ordinal_position;
