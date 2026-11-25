function assetImage(value, max) {
  if (!value) return "";
  if (typeof value !== "string" || value.length > max || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error("Imagem inválida ou muito grande.");
  return value;
}
export const UUID =
  /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export const clean = (v, n = 160) =>
  String(v ?? "")
    .trim()
    .slice(0, n);
export function moneyValue(value, max = 1000000) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max)
    throw Error("Informe um valor válido.");
  return Math.round(n * 100) / 100;
}
export function integer(value, min = 1, max = 100) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw Error(`Informe uma quantidade de ${min} a ${max}.`);
  return n;
}
export function normalizeConfig(input = {}, legacy = false) {
  const h = input.hours || {},
    zone = clean(h.timeZone || "America/Sao_Paulo", 60);
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: zone }).format();
  } catch {
    throw Error("Fuso horário inválido.");
  }
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = h.days?.[i] || {},
      open = clean(d.open || "08:00", 5),
      close = clean(d.close || "18:00", 5);
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(open) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(close) ||
      (d.enabled && open === close)
    )
      throw Error("Confira os horários de abertura e fechamento.");
    return { enabled: d.enabled === true, open, close };
  });
  const ids = new Set();
  const combos = (Array.isArray(input.combos) ? input.combos : []).map((c) => {
    if (!UUID.test(c.id) || ids.has(c.id))
      throw Error("Identificador de combo inválido.");
    ids.add(c.id);
    const productIds = [...new Set(c.productIds || [])];
    if (
      !clean(c.name) ||
      !productIds.length ||
      productIds.some((id) => !UUID.test(id))
    )
      throw Error("Informe o nome e os sabores do combo.");
    return {
      id: c.id,
      name: clean(c.name, 100),
      description: clean(c.description, 600),
      pricing: ["unit", "option"].includes(c.pricing) ? c.pricing : "fixed",
      price: ["unit", "option"].includes(c.pricing) ? 0 : moneyValue(c.price),
      units: integer(c.units, 1, 1000),
      mode: c.pricing !== "option" && c.mode === "mixed" ? "mixed" : "single",
      maxFlavors: c.pricing === "option" ? 1 : integer(c.maxFlavors || c.units, 1, 100),
      productIds,
      active: c.active !== false,
    };
  });
  if (combos.length > 100) throw Error("Limite de 100 combos.");
  const whatsapp = clean(input.whatsapp, 30).replace(/\D/g, "");
  if (whatsapp && !/^\d{10,15}$/.test(whatsapp))
    throw Error("Informe o WhatsApp com DDD.");
  const pixKey = clean(input.pixKey, 77),
    pixName = clean(input.pixName, 100),
    pixCity = clean(input.pixCity, 60);
  if (pixKey && (!pixName || !pixCity || !whatsapp))
    throw Error(
      "Para habilitar Pix, informe recebedor, cidade e WhatsApp da loja.",
    );
  return {
    pickupAddress: clean(input.pickupAddress, 400),
    promotions: Array.isArray(input.promotions) ? input.promotions.slice(0,8).map(p=>({title:clean(p.title,100),subtitle:clean(p.subtitle,200),emoji:clean(p.emoji,10),image:assetImage(p.image,180000)})) : null,
    productDescriptions: Object.fromEntries(Object.entries(input.productDescriptions || {}).filter(([id])=>/^[0-9a-f-]{36}$/i.test(id)).map(([id,text])=>[id,clean(text,1200)])),
    adminIcon: assetImage(input.adminIcon, 42000),
    shopIcon: assetImage(input.shopIcon, 42000),
    coverImage: assetImage(input.coverImage, 82000),
    deliveryFee: moneyValue(input.deliveryFee ?? (legacy ? 5 : 0)),
    whatsapp,
    pixKey,
    pixName,
    pixCity,
    hours: {
      enabled: h.enabled === true,
      paused: h.paused === true,
      timeZone: zone,
      days,
    },
    combos,
  };
}
const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export function availability(config, now = new Date()) {
  const h = config.hours;
  if (h.paused) return { open: false, label: "Fechado · atendimento pausado" };
  if (!h.enabled) return { open: true, label: "Aberto para pedidos" };
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: h.timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      p.weekday,
    ),
    m = Number(p.hour) * 60 + Number(p.minute),
    today = h.days[day],
    previous = h.days[(day + 6) % 7];
  const current =
    today.enabled &&
    (minutes(today.open) < minutes(today.close)
      ? m >= minutes(today.open) && m < minutes(today.close)
      : m >= minutes(today.open));
  const carry =
    previous.enabled &&
    minutes(previous.open) > minutes(previous.close) &&
    m < minutes(previous.close);
  return {
    open: !!(current || carry),
    label:
      current || carry
        ? "Aberto para pedidos"
        : "Fechado · fora do horário de atendimento",
  };
}
export function comboPrice(combo, selections, products) {
  if (combo.pricing === "option") {
    if (!selections.length) return 0;
    if (selections.length !== 1 || selections[0].quantity !== combo.units)
      throw Error("Escolha uma opção para o combo inteiro.");
    const product = products.find(p => p.id === selections[0].productId && p.active !== false && combo.productIds.includes(p.id));
    if (!product) throw Error("Opção indisponível neste combo.");
    return Math.round(moneyValue(product.price) * 100) * combo.units / 100;
  }
  if (combo.pricing !== "unit") return moneyValue(combo.price);
  return selections.reduce((total, selection) => {
    const product = products.find((item) => item.id === selection.productId);
    if (!product) throw Error("Sabor indisponível neste combo.");
    return total + Math.round(moneyValue(product.price) * 100) * selection.quantity;
  }, 0) / 100;
}

export function pricedItems(config, products, lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 100)
    throw Error("Confira os itens do pedido.");
  const byId = new Map(
    products.filter((p) => p.active !== false).map((p) => [p.id, p]),
  );
  return lines.map((line) => {
    const qty = integer(line.qty, 1, 99);
    if (line.comboId) {
      const combo = config.combos.find(
        (c) => c.id === line.comboId && c.active,
      );
      if (!combo) throw Error("Combo indisponível. Atualize o cardápio.");
      const selections = Array.isArray(line.selections) ? line.selections : [],
        seen = new Set();
      const flavors = selections.map((s) => {
        const p = byId.get(s.productId);
        if (!p || !combo.productIds.includes(p.id) || seen.has(p.id))
          throw Error("Sabor indisponível neste combo.");
        seen.add(p.id);
        return {
          productId: p.id,
          name: p.name,
          quantity: integer(s.quantity, 1, combo.units),
        };
      });
      if (
        !flavors.length ||
        flavors.reduce((s, x) => s + x.quantity, 0) !== combo.units ||
        flavors.length > combo.maxFlavors ||
        (combo.mode === "single" && flavors.length !== 1)
      )
        throw Error(
          `Escolha exatamente ${combo.units} unidades, respeitando os sabores do combo.`,
        );
      return {
        comboId: combo.id,
        productId: null,
        name:
          combo.name +
          " · " +
          flavors.map((f) => `${f.quantity}× ${f.name}`).join(", "),
        price: comboPrice(combo, flavors, [...byId.values()]),
        qty,
        selections: flavors,
      };
    }
    const p = byId.get(line.productId);
    if (!p) throw Error("Produto indisponível. Atualize o cardápio.");
    return {
      productId: p.id,
      name: clean(p.name),
      price: moneyValue(p.price),
      qty,
    };
  });
}
export const subtotalOf = (items) =>
  items.reduce((s, x) => s + Math.round(x.price * 100) * x.qty, 0) / 100;
