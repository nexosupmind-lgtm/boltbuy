export function readBarberTerms(input, monetary) {
  if (!input || typeof input !== 'object') throw new TypeError('Condições do plano inválidas.');
  const { included_barbers, max_addons, customizations } = input;
  if (!Number.isInteger(included_barbers) || included_barbers < 1 || included_barbers > 100 ||
      !Number.isInteger(max_addons) || max_addons < 0 || included_barbers + max_addons > 100 ||
      !Number.isInteger(customizations) || customizations < 0 || customizations > 100)
    throw new TypeError('Limites do plano inválidos.');
  return { included_barbers, max_addons, customizations,
    implementation_fee: monetary(input.implementation_fee),
    addon_fee: monetary(input.addon_fee),
    monthly_commission: monetary(input.monthly_commission) };
}
