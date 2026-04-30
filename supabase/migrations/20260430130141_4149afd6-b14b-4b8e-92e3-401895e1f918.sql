create table public.income_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  year integer not null,
  period_type text not null check (period_type in ('year', 'quarter', 'month')),
  period_value integer,
  income_type text not null default 'all' check (income_type in ('all', 'ambulatory', 'hospitalized')),
  metric text not null default 'netto' check (metric in ('netto', 'bruto', 'aandeel_arts')),
  amount numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year, period_type, period_value, income_type, metric)
);

alter table public.income_goals enable row level security;

create policy "Users can view own goals" on public.income_goals
  for select using (auth.uid() = user_id);
create policy "Users can insert own goals" on public.income_goals
  for insert with check (auth.uid() = user_id);
create policy "Users can update own goals" on public.income_goals
  for update using (auth.uid() = user_id);
create policy "Users can delete own goals" on public.income_goals
  for delete using (auth.uid() = user_id);

create trigger income_goals_set_updated_at
  before update on public.income_goals
  for each row execute function public.update_updated_at_column();

create index income_goals_user_year_idx on public.income_goals (user_id, year);