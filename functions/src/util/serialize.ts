function serializeValue(value: unknown): unknown {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeValue(v)]),
    );
  }
  return value;
}

export function serializeDoc(doc: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> {
  return { id: doc.id, ...(serializeValue(doc.data() ?? {}) as Record<string, unknown>) };
}
