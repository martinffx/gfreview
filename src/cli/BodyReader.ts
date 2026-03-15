export async function readBodyFromArg(value: string | undefined): Promise<string | undefined> {
  if (value === undefined || value === '') return value;

  if (value === '-') {
    const chunks: string[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk.toString());
    }
    return chunks.join('');
  }

  if (value.startsWith('@')) {
    const filePath = value.slice(1);
    const file = Bun.file(filePath);
    return await file.text();
  }

  return value;
}
