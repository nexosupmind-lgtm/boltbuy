/* Images are decoded and recognized locally. Only answers and review records are saved. */
(() => {
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
  let engine;
  function loadOCR() {
    if (engine) return engine;
    engine = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
      script.integrity =
        "sha384-r1ru3tcf6FhnCFR4B7pIFG+BhFF9LlFtz/P1y4pblWn3AGs9y3lBx5SKLNf4+rED";
      script.crossOrigin = "anonymous";
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => {
        script.remove();
        engine = null;
        reject(
          Error(
            "Leitor de fotos indisponível. Digite as respostas para continuar.",
          ),
        );
      };
      document.head.append(script);
    });
    return engine;
  }
  async function decode(file) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    )
      throw Error("Use uma foto JPG, PNG ou WebP de até 8 MB.");
    if (typeof createImageBitmap === "function") return createImageBitmap(file);
    return new Promise((resolve, reject) => {
      const image = new Image(),
        url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(Error("Não foi possível abrir a foto. Use JPG ou PNG."));
      };
      image.src = url;
    });
  }
  async function photoCanvas(file) {
    const image = await decode(file),
      canvas = document.createElement("canvas");
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close?.();
    return canvas;
  }
  async function recognize(file) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    )
      throw Error("Use uma foto JPG, PNG ou WebP de até 8 MB.");
    const image = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    try {
      const scale = Math.min(1, 2200 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas
        .getContext("2d")
        .drawImage(image, 0, 0, canvas.width, canvas.height);
    } finally {
      image.close();
    }
    const ocr = await loadOCR();
    const worker = await ocr.createWorker("eng", 1);
    try {
      return (await worker.recognize(canvas, { rotateAuto: true })).data.text;
    } finally {
      await worker.terminate();
      canvas.width = canvas.height = 1;
    }
  }
  function parse(text, allowBlank = false) {
    const matches = String(text)
      .toUpperCase()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d{1,3})\s*[-.:)]?\s*([A-E–—-])$/);
        if (!match)
          throw Error(
            "Confira a leitura. Cada linha deve conter apenas o número e a alternativa, por exemplo 01 A.",
          );
        return match;
      });
    const answers = new Map();
    for (const [, num, raw] of matches) {
      const question = Number(num),
        answer = raw.replace(/[–—]/g, "-");
      if (
        question < 1 ||
        answers.has(question) ||
        (!allowBlank && answer === "-")
      )
        throw Error(
          "Revise a numeração e as alternativas. Cada questão deve aparecer uma vez.",
        );
      answers.set(question, answer);
    }
    if (!answers.size || answers.size > 200)
      throw Error(
        "Informe até 200 respostas numeradas, por exemplo 01 A, uma por linha.",
      );
    return answers;
  }
  function calculate(keyText, answerText) {
    const key = parse(keyText),
      answers = parse(answerText, true);
    if (
      key.size !== answers.size ||
      [...key.keys()].some((q) => !answers.has(q))
    )
      throw Error(
        "As duas listas devem ter as mesmas questões. Use “03 -” para uma resposta em branco.",
      );
    const correct = [...key].filter(([q, a]) => answers.get(q) === a).length;
    return {
      correct,
      total: key.size,
      score: Math.round((correct / key.size) * 100) / 10,
    };
  }
  function mount(
    host,
    { students, exam, items, grades, enqueue, approve, discard, saveKey },
  ) {
    if (!host) return;
    const section = document.createElement("section");
    section.className = "teacher-card";
    section.innerHTML = `<div class="review-heading"><span class="review-symbol" aria-hidden="true">✦</span><div><small>ASSISTENTE DE CORREÇÃO</small><h3>Da foto à nota, com conferência</h3></div></div><p>Salve o gabarito da prova, selecione o aluno e envie a foto. A nota é calculada aqui; você confere e confirma o lançamento.</p>
  ${saveKey ? `<details class="review-key-editor" ${exam.answerKey ? "" : "open"}><summary>1 · Gabarito oficial <span data-key-state>${exam.answerKey ? "Salvo nesta prova" : "Ainda não salvo"}</span></summary><form data-key-form><label class="field">Quantidade de questões<input name="count" type="number" min="1" max="200" value="${exam.answerKey ? parse(exam.answerKey).size : 10}" required></label><p>Marque a alternativa correta de cada questão.</p><div class="review-key-grid" data-key-grid></div><button type="submit" class="btn">Salvar gabarito da prova</button></form></details>` : ""}
  <form class="class-review-form">
   <label class="field">2 · Aluno<select name="studentId" required><option value="">Selecione o aluno</option>${students.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></label>
   ${saveKey ? `<details class="review-official"><summary>Conferir gabarito salvo</summary><label class="field">Gabarito oficial<textarea name="key" required readonly rows="4">${esc(exam.answerKey || "")}</textarea></label></details>` : `<label class="field">Gabarito oficial<textarea name="key" required maxlength="4000" rows="4" placeholder="01 A"></textarea><input type="file" aria-label="Foto do gabarito oficial" data-ocr="key" accept="image/png,image/jpeg,image/webp"></label>`}
   <label class="field">3 · Formato da foto<select name="photoMode"><option value="sheet">Folha BOLT com bolhas preenchidas (até 40 questões)</option><option value="text">Lista numerada de alternativas (01 A, 02 B…)</option></select></label>
   <p class="review-format-help">Para ler bolhas, use a folha BOLT impressa abaixo. Fotos de outros modelos e respostas discursivas precisam de lançamento manual. Na lista numerada, confira o texto reconhecido.</p>
   <button class="btn alt" type="button" data-print-sheet>Imprimir folha de respostas</button>
   <label class="review-upload">Enviar foto das respostas<input type="file" aria-label="Foto das respostas do aluno" data-ocr="answers" accept="image/png,image/jpeg,image/webp"><small>JPG, PNG ou WebP · até 8 MB · foto processada neste aparelho</small></label>
   <img class="review-photo-preview" data-photo-preview alt="Foto enviada para conferência" hidden>
   <label class="field">Respostas lidas · confira e ajuste se necessário<textarea name="answers" required maxlength="4000" rows="5" placeholder="01 A&#10;02 B&#10;03 -"></textarea></label>
   <output class="review-score" data-score-preview aria-live="polite">A nota aparecerá depois da leitura das respostas.</output>
   <label class="life-check"><input type="checkbox" name="checked" required> Conferi as respostas lidas com a foto do aluno.</label>
   <button class="btn" type="submit">Enviar nota para análise</button>
  </form><p role="status" aria-live="polite" tabindex="-1"></p><h3>Fila de análise <span data-review-count></span></h3><div data-review-list></div>`;
    host.append(section);
    const form = section.querySelector(".class-review-form"),
      status = section.querySelector("[role=status]"),
      list = section.querySelector("[data-review-list]");
    const submit = form.querySelector('button[type="submit"]');
    const busy = (value) => {
      section
        .querySelectorAll("input,select,textarea,button")
        .forEach((el) => (el.disabled = value));
      section.setAttribute("aria-busy", String(value));
    };
    const preview = () => {
      const out = section.querySelector("[data-score-preview]");
      try {
        const value = calculate(
          form.elements.key.value,
          form.elements.answers.value,
        );
        out.innerHTML = `<strong>${value.score.toLocaleString("pt-BR")}<small> / 10</small></strong><span>${value.correct} acertos de ${value.total} questões · confira antes de lançar</span>`;
      } catch (error) {
        out.textContent = form.elements.answers.value
          ? error.message
          : "A nota aparecerá depois da leitura das respostas.";
      }
    };
    form.elements.answers.addEventListener("input", () => {
      form.elements.checked.checked = false;
      preview();
    });
    form.elements.key.addEventListener("input", preview);
    form.elements.studentId.addEventListener("change", () => {
      form.elements.answers.value = "";
      form.elements.checked.checked = false;
      section.querySelector("[data-photo-preview]").hidden = true;
      preview();
    });
    if (exam.answerKey && parse(exam.answerKey).size > 40)
      form.elements.photoMode.value = "text";
    const keyForm = section.querySelector("[data-key-form]");
    if (keyForm) {
      const draw = () => {
        let count = Number(keyForm.elements.count.value);
        if (!Number.isInteger(count) || count < 1 || count > 200) return;
        const existing = exam.answerKey ? parse(exam.answerKey) : new Map();
        section
          .querySelectorAll("[data-key-q]")
          .forEach((input) =>
            existing.set(Number(input.dataset.keyQ), input.value),
          );
        section.querySelector("[data-key-grid]").innerHTML = Array.from(
          { length: count },
          (_, n) =>
            `<label><span>${String(n + 1).padStart(2, "0")}</span><select data-key-q="${n + 1}" aria-label="Resposta correta da questão ${n + 1}" required><option value="">—</option>${["A", "B", "C", "D", "E"].map((a) => `<option ${existing.get(n + 1) === a ? "selected" : ""}>${a}</option>`).join("")}</select></label>`,
        ).join("");
      };
      draw();
      keyForm.elements.count.addEventListener("change", draw);
      keyForm.onsubmit = async (event) => {
        event.preventDefault();
        busy(true);
        try {
          const key = [...section.querySelectorAll("[data-key-q]")]
            .map(
              (input) =>
                `${String(input.dataset.keyQ).padStart(2, "0")} ${input.value}`,
            )
            .join("\n");
          parse(key);
          await saveKey(key);
          exam.answerKey = key;
          form.elements.key.value = key;
          form.elements.checked.checked = false;
          if (parse(key).size > 40) form.elements.photoMode.value = "text";
          section.querySelector("[data-key-state]").textContent =
            "Salvo nesta prova";
          status.textContent = "Gabarito salvo. Agora envie a foto do aluno.";
          preview();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          busy(false);
        }
      };
    }
    section.querySelector("[data-print-sheet]").onclick = () => {
      try {
        const count = parse(form.elements.key.value).size;
        if (!window.BOLT_ANSWER_SHEET)
          throw Error("Atualize a página para carregar a folha de respostas.");
        const svg = window.BOLT_ANSWER_SHEET.sheet(count, exam.title);
        const popup = window.open("", "_blank");
        if (!popup)
          throw Error("Permita a abertura da janela para imprimir a folha.");
        popup.opener = null;
        popup.document.write(
          `<!doctype html><html><head><title>Folha de respostas</title><style>@page{size:A4;margin:5mm}body{margin:0}svg{display:block;width:100%;height:285mm;object-fit:contain}</style></head><body>${svg}</body></html>`,
        );
        popup.document.close();
        popup.focus();
        setTimeout(() => popup.print(), 200);
      } catch (error) {
        status.textContent = error.message;
      }
    };
    for (const input of form.querySelectorAll("[data-ocr]"))
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        if (input.dataset.ocr === "answers") {
          form.elements.answers.value = "";
          form.elements.checked.checked = false;
          section.querySelector("[data-photo-preview]").hidden = true;
          preview();
        }
        busy(true);
        status.textContent = "Lendo a foto neste aparelho…";
        try {
          let text,
            uncertain = [];
          if (
            input.dataset.ocr === "answers" &&
            form.elements.photoMode.value === "sheet"
          ) {
            const count = parse(form.elements.key.value).size;
            if (!window.BOLT_ANSWER_SHEET)
              throw Error("Atualize a página para carregar o leitor.");
            const canvas = await photoCanvas(file);
            try {
              const result = window.BOLT_ANSWER_SHEET.read(
                canvas
                  .getContext("2d")
                  .getImageData(0, 0, canvas.width, canvas.height),
                count,
              );
              text = result.text;
              uncertain = result.uncertain;
              section.querySelector("[data-photo-preview]").src =
                canvas.toDataURL("image/jpeg", 0.65);
            } finally {
              canvas.width = canvas.height = 1;
            }
          } else text = await recognize(file);
          form.elements[input.dataset.ocr].value = text.slice(0, 4000);
          form.elements.checked.checked = false;
          const image = section.querySelector("[data-photo-preview]");
          if (
            input.dataset.ocr === "answers" &&
            form.elements.photoMode.value === "sheet"
          )
            image.hidden = false;
          else {
            image.hidden = true;
            image.removeAttribute("src");
          }
          preview();
          status.textContent = uncertain.length
            ? "Confira as questões " +
              uncertain.join(", ") +
              ": ficaram em branco, pouco nítidas ou com mais de uma marcação. Ajuste as respostas antes de confirmar."
            : "Leitura concluída e nota calculada. Confira as respostas e marque a confirmação antes de enviar para análise.";
        } catch (error) {
          status.textContent = error.message;
          status.focus();
        } finally {
          input.value = "";
          busy(false);
        }
      };
    form.onsubmit = async (event) => {
      event.preventDefault();
      busy(true);
      try {
        const studentId = form.elements.studentId.value;
        const key = form.elements.key.value,
          answers = form.elements.answers.value;
        await enqueue({ studentId, key, answers, ...calculate(key, answers) });
        status.textContent =
          "Nota sugerida incluída na fila. Confira abaixo e confirme o lançamento.";
        form.elements.answers.value = "";
        form.elements.studentId.value = "";
        form.elements.checked.checked = false;
        section.querySelector("[data-photo-preview]").hidden = true;
        preview();
        render();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy(false);
      }
    };
    function render() {
      const queue = items().filter((item) => item.examId === exam.id);
      section.querySelector("[data-review-count]").textContent = String(
        queue.length,
      );
      list.innerHTML =
        queue
          .map((item) => {
            const student = students.find((s) => s.id === item.studentId);
            if (!student) return "";
            const current = grades().find(
              (g) => g.teacherExamId === exam.id && g.studentId === student.id,
            );
            return `<details class="card"><summary>${esc(student.name)} · ${item.correct}/${item.total} · nota sugerida ${item.score}</summary><p>${current ? "Nota já registrada: " + esc(current.score) + ". O lançamento vai substituí-la." : "Nota ainda não lançada."}</p><details><summary>Conferir respostas</summary><p><strong>Gabarito</strong></p><pre style="white-space:pre-wrap">${esc(item.key)}</pre><p><strong>Aluno</strong></p><pre style="white-space:pre-wrap">${esc(item.answers)}</pre></details>
     <form data-review-id="${esc(item.id)}"><label class="field">Nota revisada<input name="score" required type="number" min="0" max="10" step="0.1" value="${item.score}"></label>
     <label class="field">Período<select name="period">${[1, 2, 3, 4].map((n) => `<option>${n}º Bimestre</option>`).join("")}</select></label>
     <label><input type="checkbox" name="published"> Publicar para a família</label>
     <div class="actions"><button class="btn" type="submit">Confirmar e lançar</button><button class="btn alt" type="button" data-discard>Descartar análise</button></div></form></details>`;
          })
          .join("") || '<p class="muted">Nenhuma nota aguardando análise.</p>';
      for (const review of list.querySelectorAll("[data-review-id]")) {
        review.onsubmit = async (event) => {
          event.preventDefault();
          busy(true);
          try {
            const item = items().find(
              (row) => row.id === review.dataset.reviewId,
            );
            const score = Number(review.elements.score.value);
            await approve(review.dataset.reviewId, {
              score: Number(review.elements.score.value),
              period: review.elements.period.value,
              publishStatus: review.elements.published.checked
                ? "published"
                : "draft",
            });
            const field = (
              document.getElementById("teacherResults") ||
              document.querySelector('[data-teacher-form="teacher-grades"]')
            )?.elements.namedItem("grade_" + item?.studentId);
            if (field) field.value = String(score);
            status.textContent = "Nota lançada.";
            render();
          } catch (error) {
            status.textContent = error.message;
          } finally {
            busy(false);
          }
        };
        review.querySelector("[data-discard]").onclick = async () => {
          busy(true);
          try {
            await discard(review.dataset.reviewId);
            status.textContent = "Análise descartada.";
            render();
          } catch (error) {
            status.textContent = error.message;
          } finally {
            busy(false);
          }
        };
      }
    }
    render();
  }
  window.BOLT_GRADE_REVIEW = { mount, calculate };
})();
