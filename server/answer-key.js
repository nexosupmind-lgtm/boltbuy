export function parseAnswers(value, blank = false) {
  const answers = new Map();
  for (const line of String(value ?? "")
    .trim()
    .split(/\r?\n/)) {
    const match = line
      .trim()
      .toUpperCase()
      .match(/^(\d{1,3})\s*[-.:)]?\s*([A-E–—-])$/);
    if (!match) throw Error("Use uma resposta por linha, como 01 A.");
    const question = Number(match[1]),
      answer = match[2].replace(/[–—]/g, "-");
    if (!question || answers.has(question) || (!blank && answer === "-"))
      throw Error("Revise as questões repetidas ou sem alternativa.");
    answers.set(question, answer);
  }
  if (!answers.size || answers.size > 200)
    throw Error("Informe de 1 a 200 questões.");
  return answers;
}
export function canonicalKey(value) {
  const answers = parseAnswers(value);
  if ([...answers.keys()].some((n) => n > answers.size))
    throw Error("Numere o gabarito de 1 até a última questão, sem saltos.");
  return [...answers]
    .sort((a, b) => a[0] - b[0])
    .map(([n, a]) => `${String(n).padStart(2, "0")} ${a}`)
    .join("\n");
}
export function gradeAnswers(keyText, answerText) {
  const key = parseAnswers(keyText),
    answers = parseAnswers(answerText, true);
  if (key.size !== answers.size || [...key.keys()].some((n) => !answers.has(n)))
    throw Error(
      "As respostas devem conter as mesmas questões do gabarito. Use 03 - para uma questão em branco.",
    );
  const correct = [...key].filter(([n, a]) => answers.get(n) === a).length;
  return {
    correct,
    total: key.size,
    score: Math.round((correct / key.size) * 100) / 10,
  };
}
