UPDATE public.income_records
SET income_type = 'associatie',
    total_amount = ROUND(total_amount * 0.5, 2),
    aandeel_arts = ROUND(aandeel_arts * 0.5, 2),
    bouwfonds = ROUND(bouwfonds * 0.5, 2),
    mif = ROUND(mif * 0.5, 2),
    unit_amount = ROUND(unit_amount * 0.5, 2)
WHERE income_type = 'hospitalized'
  AND year = 2026
  AND month >= 3;