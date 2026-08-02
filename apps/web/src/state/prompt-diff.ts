export type DiffOperation = "equal" | "insert" | "delete";

export interface DiffPart {
  operation: DiffOperation;
  value: string;
}

export function diffWords(before: string, after: string): DiffPart[] {
  const left = tokenize(before);
  const right = tokenize(after);
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      matrix[i]![j] =
        left[i] === right[j]
          ? (matrix[i + 1]![j + 1] ?? 0) + 1
          : Math.max(matrix[i + 1]![j] ?? 0, matrix[i]![j + 1] ?? 0);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      append(parts, "equal", left[i] ?? "");
      i += 1;
      j += 1;
    } else if ((matrix[i + 1]![j] ?? 0) >= (matrix[i]![j + 1] ?? 0)) {
      append(parts, "delete", left[i] ?? "");
      i += 1;
    } else {
      append(parts, "insert", right[j] ?? "");
      j += 1;
    }
  }
  while (i < left.length) append(parts, "delete", left[i++] ?? "");
  while (j < right.length) append(parts, "insert", right[j++] ?? "");
  return parts;
}

function tokenize(value: string): string[] {
  return value.match(/\s+|[^\s]+/g) ?? [];
}

function append(parts: DiffPart[], operation: DiffOperation, value: string): void {
  const previous = parts.at(-1);
  if (previous?.operation === operation) {
    previous.value += value;
  } else {
    parts.push({ operation, value });
  }
}
