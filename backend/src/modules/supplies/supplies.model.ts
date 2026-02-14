export type UnitBase =
  | "u"      // unidad
  | "hoja"
  | "ml"
  | "m"
  | "m2";

export interface Supply {
  id: string;
  name: string;
  unitBase: UnitBase;
  costPerUnit: number; // costo por unidad base (ej: por hoja, por ml, etc.)
  stock: number;       // stock en unidad base
  defaultConsumption?: number | null; // consumo por unidad de producto (opcional)
  defaultRounding?: "none" | "ceil" | null;
  createdAt: Date;
}
