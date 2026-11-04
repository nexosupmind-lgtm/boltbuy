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
  // Standard one-column answer grids: circles A–E in each numbered row.
  // Printed letters are calibrated independently per column; they are not marks.
  function readGrid(image, count) {
    if (!Number.isInteger(count) || count < 1 || count > 100)
      throw Error(
        "Use um bloco de 1 a 100 questões, em uma coluna, na ordem de 1 até a última.",
      );
    const { width: w, height: h, data } = image;
    const gray = new Uint8Array(w * h),
      integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = 0; x < w; x++) {
        const i = y * w + x,
          p = i * 4;
        gray[i] = Math.round(
          data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722,
        );
        sum += gray[i];
        integral[(y + 1) * (w + 1) + x + 1] =
          integral[y * (w + 1) + x + 1] + sum;
      }
    }
    const binary = new Uint8Array(w * h),
      half = Math.max(12, Math.round(Math.min(w, h) * 0.045));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half),
          x1 = Math.min(w, x + half + 1),
          y0 = Math.max(0, y - half),
          y1 = Math.min(h, y + half + 1);
        const mean =
          (integral[y1 * (w + 1) + x1] -
            integral[y0 * (w + 1) + x1] -
            integral[y1 * (w + 1) + x0] +
            integral[y0 * (w + 1) + x0]) /
          ((x1 - x0) * (y1 - y0));
        binary[y * w + x] =
          gray[y * w + x] < Math.max(25, Math.min(180, mean - 30)) ? 1 : 0;
      }
    const at = (x, y) => {
      x = Math.round(x);
      y = Math.round(y);
      return x >= 0 && y >= 0 && x < w && y < h ? binary[y * w + x] : 0;
    };
    const seen = new Uint8Array(w * h),
      queue = new Int32Array(w * h),
      candidates = [];
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || !binary[start]) continue;
      let head = 0,
        tail = 1;
      queue[0] = start;
      seen[start] = 1;
      let x0 = w,
        x1 = 0,
        y0 = h,
        y1 = 0;
      while (head < tail) {
        const p = queue[head++],
          x = p % w,
          y = Math.floor(p / w);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
            const q = yy * w + xx;
            if (!seen[q] && binary[q]) {
              seen[q] = 1;
              queue[tail++] = q;
            }
          }
      }
      const bw = x1 - x0 + 1,
        bh = y1 - y0 + 1,
        r = (bw + bh) / 4,
        cx = (x0 + x1) / 2,
        cy = (y0 + y1) / 2;
      if (
        bw < Math.max(10, w * 0.012) ||
        bh < 10 ||
        bw > Math.min(w, h) * 0.15 ||
        bh > Math.min(w, h) * 0.15 ||
        bw / bh < 0.7 ||
        bw / bh > 1.4
      )
        continue;
      let ring = 0;
      for (let a = 0; a < 32; a++) {
        const angle = (a * Math.PI) / 16;
        ring += [0.85, 0.94, 1.02].some((scale) =>
          at(
            cx + ((Math.cos(angle) * bw) / 2) * scale,
            cy + ((Math.sin(angle) * bh) / 2) * scale,
          ),
        )
          ? 1
          : 0;
      }
      if (ring / 32 >= 0.68)
        candidates.push({ x: cx, y: cy, rx: bw / 2, ry: bh / 2, r });
    }
    if (candidates.length < 5)
      throw Error(
        "Não encontrei as alternativas circuladas. Envie o bloco inteiro, nítido, com A, B, C, D e E em cada linha.",
      );
    let radius = 0,
      best = 0;
    for (const c of candidates) {
      const support = candidates.filter(
        (p) => p.r / c.r > 0.82 && p.r / c.r < 1.22,
      ).length;
      if (support > best || (support === best && c.r > radius)) {
        best = support;
        radius = c.r;
      }
    }
    const circles = candidates.filter(
      (c) => c.r / radius > 0.76 && c.r / radius < 1.3,
    );
    const median = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const slopes = [];
    for (const a of circles)
      for (const b of circles) {
        const dx = b.x - a.x,
          dy = b.y - a.y;
        if (dx > radius * 3 && dx < radius * 8 && Math.abs(dy) < radius * 1.7)
          slopes.push(dy / dx);
      }
    const slope = slopes.length ? median(slopes) : 0;
    circles.forEach((c) => {
      c.u = c.x + slope * c.y;
      c.v = c.y - slope * c.x;
    });
    const rows = [];
    for (const c of circles.sort((a, b) => a.v - b.v)) {
      let row = rows.find(
        (row) => Math.abs(median(row.map((p) => p.v)) - c.v) < radius * 0.9,
      );
      if (!row) {
        row = [];
        rows.push(row);
      }
      row.push(c);
    }
    const validRows = rows.filter((row) => row.length >= 4 && row.length <= 6);
    const fullRows = validRows
      .filter((row) => row.length === 5)
      .map((row) => row.sort((a, b) => a.u - b.u));
    if (!fullRows.length || validRows.length !== count)
      throw Error(
        `Identifiquei ${validRows.length} linhas de alternativas, mas a prova tem ${count} questões. Inclua todas as questões em uma única coluna e corte títulos ou outros blocos da foto.`,
      );
    const anchors = Array.from({ length: 5 }, (_, i) =>
      median(fullRows.map((row) => row[i].u)),
    );
    const gaps = anchors.slice(1).map((x, i) => x - anchors[i]);
    if (
      Math.min(...gaps) < radius * 2.3 ||
      Math.max(...gaps) > median(gaps) * 1.45
    )
      throw Error(
        "As alternativas não ficaram alinhadas. Fotografe de frente, com apenas um bloco A–E.",
      );
    const crossRows = [];
    const measured = validRows
      .sort((a, b) => median(a.map((p) => p.v)) - median(b.map((p) => p.v)))
      .map((row) => {
        const v = median(row.map((p) => p.v));
        const crosses = [];
        const scores = anchors.map((u) => {
          const nearby = row
            .filter((p) => Math.abs(p.u - u) < radius * 1.4)
            .sort((a, b) => Math.abs(a.u - u) - Math.abs(b.u - u))[0];
          const cx = nearby?.x ?? (u - slope * v) / (1 + slope * slope),
            cy = nearby?.y ?? (v + slope * u) / (1 + slope * slope);
          const rx = nearby?.rx ?? radius,
            ry = nearby?.ry ?? radius;
          const diagonal = (direction, ox, oy) =>
            [-0.6, -0.48, -0.36, 0.36, 0.48, 0.6].filter((t) =>
              [-1, 0, 1].some((dx) =>
                at(
                  cx + (t + ox) * rx - slope * (t * direction + oy) * ry + dx,
                  cy + (t * direction + oy) * ry + slope * (t + ox) * rx,
                ),
              ),
            ).length / 6;
          crosses.push(
            [-0.2, -0.1, 0, 0.1, 0.2].some((ox) =>
              [-0.2, -0.1, 0, 0.1, 0.2].some(
                (oy) => diagonal(1, ox, oy) > 0.8 && diagonal(-1, ox, oy) > 0.8,
              ),
            ),
          );
          let ink = 0,
            total = 0;
          for (let sy = -9; sy <= 9; sy++)
            for (let sx = -9; sx <= 9; sx++)
              if (sx * sx + sy * sy <= 81) {
                ink += at(cx + (sx / 9) * rx * 0.72, cy + (sy / 9) * ry * 0.72);
                total++;
              }
          return ink / total;
        });
        crossRows.push(crosses);
        return scores;
      });
    // Lower quantile estimates each printed letter's natural ink coverage.
    const baselines = anchors.map((_, a) => {
      const values = measured.map((row) => row[a]).sort((a, b) => a - b);
      return values[Math.floor((values.length - 1) * 0.2)];
    });
    const thresholds = anchors.map((_, a) => {
      const values = measured.map((row) => row[a]);
      const center = median(values);
      return Math.max(
        0.06,
        3 * median(values.map((v) => Math.abs(v - center))) + 0.025,
      );
    });
    const crossSupport = anchors.map(
      (_, a) => crossRows.filter((row) => row[a]).length / crossRows.length,
    );
    const uncertain = [],
      questions = [];
    const text = measured
      .map((scores, i) => {
        const crosses = scores.map(
          (value, a) =>
            crossRows[i][a] &&
            (value - baselines[a] > 0.05 || crossSupport[a] > 0.6),
        );
        const selected = scores
          .map((value, a) =>
            value > 0.68 || crosses[a] || value - baselines[a] > thresholds[a]
              ? a
              : -1,
          )
          .filter((a) => a >= 0);
        const weak = scores.some(
          (value, a) =>
            !crosses[a] &&
            value - baselines[a] > thresholds[a] * 0.7 &&
            value - baselines[a] <= thresholds[a],
        );
        const answer =
          selected.length === 1 && !weak ? "ABCDE"[selected[0]] : "-";
        const state =
          selected.length > 1
            ? "multiple"
            : selected.length === 0 && !weak
              ? "blank"
              : answer === "-"
                ? "uncertain"
                : "marked";
        if (answer === "-") uncertain.push(i + 1);
        questions.push({ number: i + 1, answer, state });
        return `${String(i + 1).padStart(2, "0")} ${answer}`;
      })
      .join("\n");
    return { text, uncertain, questions };
  }
  window.BOLT_ANSWER_SHEET = { sheet, read, readGrid };
})();
