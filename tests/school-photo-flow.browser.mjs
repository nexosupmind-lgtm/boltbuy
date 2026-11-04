// Run with Playwright installed. Set BOLT_TEST_CHROMIUM for a custom executable.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = fileURLToPath(new URL("../SITE/", import.meta.url));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BOLT_TEST_CHROMIUM
    ? {
        executablePath: process.env.BOLT_TEST_CHROMIUM,
        args: [
          "--no-sandbox",
          "--no-zygote",
          "--single-process",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const teacher = {
    ok: true,
    role: "teacher",
    teacher: "Ana Carolina",
    school: {
      name: "Escola Exemplo",
      color: "#c52a30",
      logo: "https://bolt.test/logo.png",
    },
    classes: [{ id: "c1", name: "1º A" }],
    subjects: [{ classId: "c1", subjects: ["Matemática"] }],
    students: [{ id: "s1", name: "Alice Martins", classId: "c1" }],
    attendance: [],
    items: [
      {
        id: "e1",
        classId: "c1",
        title: "Números e descobertas",
        type: "exam",
        subject: "Matemática",
        due: "2026-11-10",
        status: "published",
      },
    ],
    grades: [],
    gradeReviewQueue: [],
    routines: [],
    threads: [],
  };
  const family = {
    ok: true,
    school: teacher.school,
    student: { id: "s1", name: "Alice Martins", className: "1º A" },
    guardian: "Ana",
    attendance: [{ status: "P" }, { status: "F" }],
    grades: [],
    activities: [],
    calendar: [{ title: "Encontro das famílias", date: "2026-11-10" }],
    messages: [
      {
        title: "Uma semana de descobertas",
        date: "2026-11-04",
        content: "Acompanhe as atividades da turma.",
      },
    ],
    gradeSummary: [],
  };
  const school = {
    id: "school-a",
    slug: "escola-a",
    name: "Escola Exemplo",
    color: "#c52a30",
    logo: teacher.school.logo,
    modules: [
      "students",
      "staff",
      "classes",
      "grades",
      "finance",
      "family",
      "messages",
      "calendar",
      "attendance",
      "reports",
    ],
    students: teacher.students,
    staff: [],
    classes: teacher.classes,
    attendance: [],
    grades: [],
    finance: [],
    messages: [],
    calendar: [],
  };
  const bundle = {
    client: { id: "school-a", slug: "escola-a", name: school.name },
    user: { name: "Ana Carolina", email: "ana@example.test" },
    branding: { primary_color: "#c52a30", logo_url: teacher.school.logo },
    settings: { features: {} },
    data: { schools: [school], logs: [], plans: [] },
  };
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/school-life") {
      if (route.request().method() === "POST") {
        const b = route.request().postDataJSON();
        if (b.action === "teacher-answer-key")
          teacher.items[0].answerKey = b.key;
        if (b.action === "review-enqueue")
          teacher.gradeReviewQueue = [{ id: "r1", examId: "e1", ...b.record }];
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({
        json: page.url().includes("/Boltclass/")
          ? { ok: true, role: "owner", alerts: [], life: {} }
          : teacher,
      });
    }
    if (url.pathname === "/api/family") return route.fulfill({ json: family });
    if (url.pathname === "/bolt-workspace.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: `window.BOLT_WORKSPACE={open:async()=>({bundle:${JSON.stringify(bundle)},client:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}},save:()=>{},flush:async()=>true}),fail:(e,root)=>{root.textContent=e.message}};`,
      });
    if (url.pathname === "/bolt-config.js")
      return route.fulfill({
        contentType: "application/javascript",
        body: 'window.BOLT_CONFIG={supabaseUrl:"https://test.supabase.co",supabaseAnonKey:"test"}',
      });
    if (url.pathname === "/bolt-shell.js")
      return route.fulfill({ contentType: "application/javascript", body: "" });
    if (url.pathname.includes("tesseract")) return route.abort();
    if (url.hostname === "cdn.jsdelivr.net")
      return route.fulfill({
        contentType: "application/javascript",
        body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:"test"}}}),signOut:async()=>{}}})};',
      });
    if (url.pathname === "/logo.png")
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><text x="120" y="40" text-anchor="middle" fill="white" font-family="Arial" font-size="22" font-weight="bold">ESCOLA</text><text x="120" y="68" text-anchor="middle" fill="white" font-family="Arial" font-size="20">EXEMPLO</text></svg>',
      });
    const file = base + decodeURIComponent(url.pathname).slice(1);
    if (existsSync(file))
      return route.fulfill({
        contentType: file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".js")
            ? "application/javascript"
            : file.endsWith(".png")
              ? "image/png"
              : "text/html",
        body: readFileSync(file),
      });
    return route.abort();
  });
  await page.goto("https://bolt.test/teacher.html?slug=escola-a");
  await page.locator("[data-school-surface=teacher]").waitFor();
  assert.equal(
    await page
      .locator(".teacher-topbar")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(197, 42, 48)",
  );
  await page.locator(".teacher-mobile-nav [data-teacher-tab=grades]").click();
  const input = page.locator("[data-ocr=answers]"),
    feedback = page.locator("[data-photo-feedback]");
  await page.locator("[data-read-photo]").click();
  await page
    .getByText("Selecione uma foto primeiro.", { exact: true })
    .waitFor();
  const png = await page.evaluate(async () => {
    const svg = window.BOLT_ANSWER_SHEET.sheet(3).replace(
      "</svg>",
      '<g fill="black"><circle cx="160" cy="250" r="8"/><circle cx="208" cy="285" r="8"/><circle cx="352" cy="320" r="8"/></g></svg>',
    );
    const image = new Image();
    image.src =
      "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1100;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const file = {
    name: "folha.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  };
  await input.setInputFiles(file);
  await feedback.filter({ hasText: "Salve primeiro o gabarito" }).waitFor();
  assert.equal(await feedback.getAttribute("data-state"), "error");
  assert.equal(await page.locator("[data-photo-preview]").isVisible(), true);
  await page.locator("[data-key-form] input[name=count]").fill("3");
  await page
    .locator("[data-key-form] input[name=count]")
    .dispatchEvent("change");
  for (let n = 1; n <= 3; n++)
    await page.locator(`[data-key-q="${n}"]`).selectOption("ABC"[n - 1]);
  await page.getByRole("button", { name: "Salvar gabarito da prova" }).click();
  await page
    .getByText("Gabarito salvo. Agora envie a foto do aluno.")
    .waitFor();
  await page.locator("select[name=photoMode]").selectOption("sheet");
  await page.locator("[data-read-photo]").click();
  await feedback.filter({ hasText: "Leitura concluída" }).waitFor();
  assert.equal(
    await page.locator("textarea[name=answers]").inputValue(),
    "01 A\n02 B\n03 E",
  );
  assert.match(await page.locator("[data-score-preview]").innerText(), /6,7/);
  assert.equal(await feedback.getAttribute("data-state"), "done");
  // A normal PNG of another model must show a local error, not silent failure.
  const blank = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 500;
    c.height = 700;
    c.getContext("2d").fillRect(0, 0, 500, 700);
    return c.toDataURL().split(",")[1];
  });
  await input.setInputFiles({
    name: "outro-modelo.png",
    mimeType: "image/png",
    buffer: Buffer.from(blank, "base64"),
  });
  await feedback.filter({ hasText: "quadrados" }).waitFor();
  assert.equal(await feedback.getAttribute("role"), "alert");
  assert.equal(await input.isEnabled(), true);
  assert.equal(await page.locator("textarea[name=answers]").inputValue(), "");
  assert.equal(await page.locator("[data-photo-preview]").isVisible(), true);
  await input.setInputFiles({
    name: "invalido.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("not an image"),
  });
  await feedback.filter({ hasText: "Não foi possível abrir" }).waitFor();
  assert.equal(await input.isEnabled(), true);
  assert.equal(await page.locator("[data-photo-preview]").isVisible(), false);
  await page.locator("select[name=photoMode]").selectOption("text");
  await input.setInputFiles(file);
  await feedback.filter({ hasText: "Leitor de fotos indisponível" }).waitFor();
  assert.equal(await input.isEnabled(), true);
  await page.screenshot({
    path: "/tmp/school-photo-feedback.png",
    fullPage: true,
  });
  // The user's normal A–E grid is a supported input without BOLT markers.
  await page.locator("select[name=photoMode]").selectOption("grid");
  await page.locator("[data-key-form] input[name=count]").fill("10");
  await page
    .locator("[data-key-form] input[name=count]")
    .dispatchEvent("change");
  for (let n = 1; n <= 10; n++)
    await page.locator(`[data-key-q="${n}"]`).selectOption("A");
  await page.getByRole("button", { name: "Salvar gabarito da prova" }).click();
  await page
    .getByText("Gabarito salvo. Agora envie a foto do aluno.")
    .waitFor();
  const fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/standard-answer-grid.json", import.meta.url),
      "utf8",
    ),
  );
  const raster = {
    width: fixture.width,
    height: fixture.height,
    gray: inflateSync(Buffer.from(fixture.gray_zlib, "base64")).toString(
      "base64",
    ),
  };
  const makeGrid = (marks) =>
    page.evaluate(
      ({ raster, marks }) => {
        const canvas = document.createElement("canvas");
        canvas.width = raster.width;
        canvas.height = raster.height;
        const context = canvas.getContext("2d"),
          pixels = context.createImageData(canvas.width, canvas.height),
          gray = atob(raster.gray);
        for (let i = 0; i < gray.length; i++) {
          pixels.data[i * 4] =
            pixels.data[i * 4 + 1] =
            pixels.data[i * 4 + 2] =
              gray.charCodeAt(i);
          pixels.data[i * 4 + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
        const xs = [134, 211, 289, 367, 445],
          ys = [40, 91, 145, 202, 257, 312, 369, 426, 481, 544];
        context.fillStyle = "#142050";
        marks.forEach((a, n) => {
          context.beginPath();
          context.arc(xs["ABCDE".indexOf(a)], ys[n], 11, 0, Math.PI * 2);
          context.fill();
        });
        return canvas.toDataURL().split(",")[1];
      },
      { raster, marks },
    );
  const noMarks = await makeGrid([]);
  await input.setInputFiles({
    name: "gabarito-comum.png",
    mimeType: "image/png",
    buffer: Buffer.from(noMarks, "base64"),
  });
  await feedback.filter({ hasText: "Foto lida. Confira" }).waitFor();
  assert.equal(
    await page.locator("[data-detection-results] [data-state=blank]").count(),
    10,
  );
  const marked = await makeGrid([
    "A",
    "B",
    "C",
    "D",
    "E",
    "A",
    "B",
    "C",
    "D",
    "E",
  ]);
  await input.setInputFiles({
    name: "gabarito-marcado.png",
    mimeType: "image/png",
    buffer: Buffer.from(marked, "base64"),
  });
  await feedback.filter({ hasText: "Leitura concluída" }).waitFor();
  assert.equal(
    await page.locator("[data-detection-results] [data-state=marked]").count(),
    10,
  );
  assert.match(
    await page.locator("[data-score-preview]").innerText(),
    /2 acertos de 10/,
  );
  assert.equal(await page.locator("input[name=checked]").isChecked(), false);
  const jpeg = await page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = "data:image/png;base64," + encoded;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.72).split(",")[1];
  }, marked);
  await input.setInputFiles({
    name: "gabarito-camera.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(jpeg, "base64"),
  });
  await feedback.filter({ hasText: "Leitura concluída" }).waitFor();
  assert.equal(
    await page.locator("[data-detection-results] [data-state=marked]").count(),
    10,
  );
  assert.match(
    await page.locator("[data-score-preview]").innerText(),
    /2 acertos de 10/,
  );
  await page.screenshot({
    path: "/tmp/standard-grid-read.png",
    fullPage: true,
  });
  for (const [url, ready, shot] of [
    [
      "https://bolt.test/teacher.html?slug=escola-a",
      ".teacher-welcome",
      "teacher",
    ],
    [
      "https://bolt.test/family.html?slug=escola-a",
      ".school-frequency-ring",
      "family",
    ],
    ["https://bolt.test/Boltclass/index.html", ".class-brand-plate", "admin"],
  ]) {
    await page.goto(url);
    await page.locator(ready).waitFor();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: `/tmp/school-${shot}-${width}.png`,
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${shot} at ${width}px`,
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: missing file/key feedback, retained-file retry, automatic PNG correction, invalid model/image errors, preview, enabled retry; teacher/family/admin at 390/1280px, primary-colored branding and no overflow.",
  );
} finally {
  await browser.close();
}
