/* Local optical mark reading for the printed BOLT answer sheet. No photo is uploaded. */
(() => {
  const corners = [
    [45, 45],
    [755, 45],
    [755, 1055],
    [45, 1055],
  ];
  const point = (n, a) => [
    n < 20 ? 160 + a * 48 : 520 + a * 48,
    250 + (n % 20) * 35,
  ];
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function sheet(count, title = "Avaliação") {
    if (!Number.isInteger(count) || count < 1 || count > 40)
      throw Error(
        "A folha por marcação aceita de 1 a 40 questões. Para provas maiores, use respostas numeradas.",
      );
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100" width="800" height="1100"><rect width="800" height="1100" fill="white"/><g fill="black"><circle cx="90" cy="45" r="7"/>${corners.map(([x, y]) => `<rect x="${x - 12}" y="${y - 12}" width="24" height="24"/>`).join("")}<g font-family="Arial,sans-serif"><text x="80" y="100" font-size="15">BOLT CLASS · FOLHA DE RESPOSTAS · ${count} QUESTÕES</text><text x="80" y="135" font-size="22">${esc(title.slice(0, 48))}</text><text x="80" y="175" font-size="15">Aluno: _____________________________________ Turma: __________</text><text x="80" y="205" font-size="13">Preencha UMA bolha por questão com caneta preta. Não risque os quadrados.</text>${[
      0, 1,
    ]
      .filter((col) => col === 0 || count > 20)
      .map((col) =>
        ["A", "B", "C", "D", "E"]
          .map(
            (a, i) =>
              `<text x="${point(col * 20, i)[0]}" y="225" font-size="13" text-anchor="middle">${a}</text>`,
          )
          .join(""),
      )
      .join("")}${Array.from(
      { length: count },
      (_, n) =>
        `<text x="${n < 20 ? 90 : 450}" y="${point(n, 0)[1] + 5}" font-size="14">${String(n + 1).padStart(2, "0")}</text>${[
          0, 1, 2, 3, 4,
        ]
          .map((a) => {
            const [x, y] = point(n, a);
            return `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="black" stroke-width="1.3"/>`;
          })
          .join("")}`,
    ).join(
      "",
    )}<text x="80" y="1010" font-size="13">Fotografe a folha inteira, bem iluminada, com os 4 quadrados visíveis.</text><text x="80" y="1032" font-size="12">Mantenha o título no alto da foto. A correção deve ser conferida pelo professor.</text></g></g></svg>`;
  }
  function transform(source, target) {
    const matrix = [];
    source.forEach(([x, y], i) => {
      const [u, v] = target[i];
      matrix.push(
        [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
        [0, 0, 0, x, y, 1, -v * x, -v * y, v],
      );
    });
    for (let col = 0; col < 8; col++) {
      let pivot = col;
      for (let row = col + 1; row < 8; row++)
        if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col]))
          pivot = row;
      [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
      if (Math.abs(matrix[col][col]) < 1e-10)
        throw Error("Não foi possível alinhar a folha. Fotografe de frente.");
      const scale = matrix[col][col];
      for (let j = col; j < 9; j++) matrix[col][j] /= scale;
      for (let row = 0; row < 8; row++)
        if (row !== col) {
          const scale = matrix[row][col];
          for (let j = col; j < 9; j++)
            matrix[row][j] -= scale * matrix[col][j];
        }
    }
    const h = matrix.map((row) => row[8]);
    return (x, y) => {
      const d = h[6] * x + h[7] * y + 1;
      return [
        (h[0] * x + h[1] * y + h[2]) / d,
        (h[3] * x + h[4] * y + h[5]) / d,
      ];
    };
  }
  function read(image, count) {
    if (!Number.isInteger(count) || count < 1 || count > 40)
      throw Error("Use a folha BOLT de até 40 questões.");
    const { width, height, data } = image;
    const dark = (x, y) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const i = (y * width + x) * 4;
      return (
        data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722 < 120
      );
    };
    const seen = new Uint8Array(width * height),
      candidates = [];
    // Find isolated solid squares, then choose one in each image corner.
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const start = y * width + x;
        if (seen[start] || !dark(x, y)) continue;
        const stack = [start];
        seen[start] = 1;
        let size = 0,
          x0 = x,
          x1 = x,
          y0 = y,
          y1 = y;
        while (stack.length) {
          const p = stack.pop(),
            px = p % width,
            py = Math.floor(p / width);
          size++;
          x0 = Math.min(x0, px);
          x1 = Math.max(x1, px);
          y0 = Math.min(y0, py);
          y1 = Math.max(y1, py);
          for (const q of [
            px > 0 ? p - 1 : -1,
            px < width - 1 ? p + 1 : -1,
            py > 0 ? p - width : -1,
            py < height - 1 ? p + width : -1,
          ])
            if (q >= 0 && !seen[q]) {
              seen[q] = 1;
              if (dark(q % width, Math.floor(q / width))) stack.push(q);
            }
        }
        const w = x1 - x0 + 1,
          h = y1 - y0 + 1;
        if (
          w >= width * 0.009 &&
          w <= width * 0.09 &&
          h >= height * 0.007 &&
          h <= height * 0.08 &&
          w / h > 0.5 &&
          w / h < 1.8 &&
          size / (w * h) > 0.72
        )
          candidates.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, size });
      }
    const targets = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ].map(([cx, cy]) => {
      const region = candidates.filter(
        (p) =>
          (cx === 0 ? p.x < width * 0.3 : p.x > width * 0.7) &&
          (cy === 0 ? p.y < height * 0.3 : p.y > height * 0.7),
      );
      region.sort(
        (a, b) =>
          Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy),
      );
      return region[0];
    });
    if (targets.some((p) => !p))
      throw Error(
        "Os 4 quadrados da folha BOLT não foram encontrados. Inclua a folha inteira, na posição correta e sem sombras.",
      );
    const map = transform(
      corners,
      targets.map((p) => [p.x, p.y]),
    );
    // The asymmetric top-left dot prevents upside-down / sideways sheets from
    // silently assigning marks to the wrong question numbers.
    const orientation = map(90, 45);
    if (!dark(...orientation))
      throw Error(
        "A folha está girada ou fora de posição. Coloque o título no alto da foto e tente novamente.",
      );
    const values = [],
      uncertain = [];
    for (let n = 0; n < count; n++) {
      const fills = [0, 1, 2, 3, 4].map((a) => {
        const [cx, cy] = point(n, a);
        let ink = 0,
          samples = 0;
        for (let y = -5; y <= 5; y++)
          for (let x = -5; x <= 5; x++)
            if (x * x + y * y <= 25) {
              const [px, py] = map(cx + x, cy + y);
              ink += dark(px, py) ? 1 : 0;
              samples++;
            }
        return ink / samples;
      });
      const selected = fills
        .map((v, i) => (v > 0.48 ? i : -1))
        .filter((i) => i >= 0);
      const ambiguous =
        selected.length !== 1 || fills.some((v) => v > 0.18 && v <= 0.48);
      if (ambiguous) uncertain.push(n + 1);
      values.push(
        `${String(n + 1).padStart(2, "0")} ${ambiguous ? "-" : "ABCDE"[selected[0]]}`,
      );
    }
    return { text: values.join("\n"), uncertain };
  }
  window.BOLT_ANSWER_SHEET = { sheet, read };
})();
