-- Presupuesto inicial sugerido para junio 2026
-- Usuario: 5fe56a78-457e-4f44-86f8-a7aa991964ba

-- 1) Ampliar catálogo de categorías sin duplicar
insert into public.categories (user_id, name, category_type, is_active)
select
  '5fe56a78-457e-4f44-86f8-a7aa991964ba',
  seed.name,
  seed.category_type,
  true
from (
  values
    ('Despensa', 'expense'),
    ('Restaurantes', 'expense'),
    ('Cafe', 'expense'),
    ('Delivery', 'expense'),
    ('Estacionamiento', 'expense'),
    ('Casetas', 'expense'),
    ('Uber / Taxi', 'expense'),
    ('Transporte publico', 'expense'),
    ('Mantenimiento auto', 'expense'),
    ('Seguro auto', 'expense'),
    ('Medico', 'expense'),
    ('Dentista', 'expense'),
    ('Laboratorios', 'expense'),
    ('Renta / Hipoteca', 'expense'),
    ('Luz', 'expense'),
    ('Agua', 'expense'),
    ('Gas', 'expense'),
    ('Seguro de vida', 'expense'),
    ('Seguro medico', 'expense'),
    ('Colegiatura', 'expense'),
    ('Cursos', 'expense'),
    ('Libros', 'expense'),
    ('Veterinario', 'expense'),
    ('Calzado', 'expense'),
    ('Belleza', 'expense'),
    ('Gimnasio', 'expense'),
    ('Hoteles', 'expense'),
    ('Vuelos', 'expense'),
    ('Comisiones bancarias', 'expense'),
    ('Impuestos', 'expense'),
    ('Electronica', 'expense'),
    ('Muebles', 'expense'),
    ('Honorarios', 'income'),
    ('Bono', 'income'),
    ('Intereses / Rendimientos', 'income')
) as seed(name, category_type)
where not exists (
  select 1
  from public.categories c
  where c.user_id = '5fe56a78-457e-4f44-86f8-a7aa991964ba'
    and lower(c.name) = lower(seed.name)
    and c.category_type = seed.category_type
);

-- 2) Presupuesto inicial sugerido para junio 2026
with target_budgets as (
  select *
  from (
    values
      ('Supermercado', 2000.00),
      ('Comida', 2000.00),
      ('Gasolina', 1500.00),
      ('Internet', 1050.00),
      ('Telefono', 650.00),
      ('Suscripciones', 450.00),
      ('Entretenimiento', 700.00),
      ('Salud', 800.00),
      ('Otros gastos', 1000.00)
  ) as v(category_name, budget_amount)
),
resolved_categories as (
  select
    c.id as category_id,
    tb.category_name,
    tb.budget_amount
  from target_budgets tb
  join public.categories c
    on c.user_id = '5fe56a78-457e-4f44-86f8-a7aa991964ba'
   and c.category_type = 'expense'
   and lower(c.name) = lower(tb.category_name)
),
updated as (
  update public.budgets b
  set budget_amount = rc.budget_amount
  from resolved_categories rc
  where b.category_id = rc.category_id
    and b.period_month = 6
    and b.period_year = 2026
  returning b.category_id
)
insert into public.budgets (user_id, category_id, budget_amount, period_month, period_year)
select
  '5fe56a78-457e-4f44-86f8-a7aa991964ba',
  rc.category_id,
  rc.budget_amount,
  6,
  2026
from resolved_categories rc
where not exists (
  select 1
  from public.budgets b
  where b.category_id = rc.category_id
    and b.period_month = 6
    and b.period_year = 2026
);

-- 3) Validación rápida
select
  c.name as category,
  b.budget_amount,
  b.period_month,
  b.period_year
from public.budgets b
join public.categories c on c.id = b.category_id
where b.user_id = '5fe56a78-457e-4f44-86f8-a7aa991964ba'
  and b.period_month = 6
  and b.period_year = 2026
order by b.budget_amount desc, c.name;
