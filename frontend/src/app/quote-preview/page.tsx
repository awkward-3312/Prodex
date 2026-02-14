"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { confirmDialog, promptSupervisorCredentials, toast } from "@/lib/alerts";

type DesignLevel = "cliente" | "simple" | "medio" | "pro";
type DiscountType = "none" | "seasonal" | "delay" | "senior" | "special_case";
type DiscountSeason =
  | "navidad"
  | "dia_mujer"
  | "dia_padre"
  | "dia_madre"
  | "verano"
  | "black_friday"
  | "otro";

type PreviewResponse = {
  breakdown: Array<{
    supplyName: string;
    unitBase: string;
    qty: number;
    costPerUnit: number;
    lineCost: number;
    formula: string;
  }>;
  totals: {
    materialsCost: number;
    wasteCost: number;
    operationalCost: number;
    designCost: number;
    costTotal: number;
    minPrice: number;
    suggestedPrice: number;
    profit: number;
    marginReal: number;
    applyIsv: boolean;
    isvRate: number;
    isv: number;
    total: number;
  };
};

type CreateQuoteResponse = {
  quoteId: string;
  quote: {
    id: string;
    status: string;
    price_final: number;
    isv_amount: number;
    total: number;
    expires_at: string;
  };
};

type CreateQuoteGroupResponse = {
  groupId: string;
  group: {
    id: string;
    status: string;
    price_final: number;
    isv_amount: number;
    total: number;
  };
};

type MissingItem = {
  supplyId: string;
  name: string;
  needed: number;
  available: number;
};

type ConvertOk = { ok: true; quote: { id: string; status: string } };
type ConvertErr = { error: string; missing?: MissingItem[] };
type ConvertResponse = ConvertOk | ConvertErr;

type ProductSuggestion = {
  id: string;
  name?: string | null;
};

type CustomerSuggestion = {
  id: string;
  name?: string | null;
  rtn?: string | null;
};

type CartItem = {
  id: string;
  productId: string;
  productLabel: string;
  inputs: { cantidad: number; diseño: DesignLevel };
  applyIsv: boolean;
  isvRate: number;
  priceFinal: number;
  suggestedPrice: number;
  totalWithIsv: number;
  isvAmount: number;
  discount: {
    type: DiscountType;
    season?: DiscountSeason;
    reason: string;
    amount: number;
  } | null;
  breakdown: PreviewResponse["breakdown"];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function QuotePreviewPage() {
  const API = process.env.NEXT_PUBLIC_API_URL!;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [productId, setProductId] = useState<string>("");
  const [productQuery, setProductQuery] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<ProductSuggestion | null>(null);
  const [productSuggestions, setProductSuggestions] = useState<ProductSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [productStatus, setProductStatus] = useState<"idle" | "checking" | "valid" | "invalid">(
    "idle"
  );

  const [customerEnabled, setCustomerEnabled] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerSuggestion[]>([]);
  const [isSuggestingCustomer, setIsSuggestingCustomer] = useState(false);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSuggestion | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    rtn: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const [cantidad, setCantidad] = useState<number>(1);
  const [design, setDesign] = useState<DesignLevel>("cliente");
  const [applyIsv, setApplyIsv] = useState<boolean>(false);
  const [priceFinal, setPriceFinal] = useState<number>(0);
  const [priceFinalMode, setPriceFinalMode] = useState<"auto" | "manual">("auto");
  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [discountSeason, setDiscountSeason] = useState<DiscountSeason>("navidad");
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>("");

  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [saved, setSaved] = useState<CreateQuoteResponse | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [savedGroup, setSavedGroup] = useState<CreateQuoteGroupResponse | null>(null);
  const [showAggregatedBreakdown, setShowAggregatedBreakdown] = useState(true);

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);

  const blurTimeoutRef = useRef<number | null>(null);
  const customerBlurTimeoutRef = useRef<number | null>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const lastAppliedParamsRef = useRef<string | null>(null);

  const [meInfo, setMeInfo] = useState<{
    userId: string;
    role: string;
    fullName?: string | null;
  } | null>(null);

  useEffect(() => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, [showSuggestions]);

  useEffect(() => {
    if (customerBlurTimeoutRef.current) {
      window.clearTimeout(customerBlurTimeoutRef.current);
      customerBlurTimeoutRef.current = null;
    }
  }, [showCustomerSuggestions]);

  useEffect(() => {
    const key = searchParams.toString();
    if (!key || key === lastAppliedParamsRef.current) return;

    const pid = searchParams.get("productId");
    const qtyRaw = searchParams.get("cantidad");
    const designRaw = searchParams.get("diseno");

    if (pid && UUID_RE.test(pid)) {
      setProductId(pid);
      setProductQuery(pid);
      setSelectedProduct(null);
      setShowSuggestions(false);
    }

    if (qtyRaw) {
      const qty = Number(qtyRaw);
      if (Number.isFinite(qty) && qty > 0) setCantidad(qty);
    }

    if (designRaw && ["cliente", "simple", "medio", "pro"].includes(designRaw)) {
      setDesign(designRaw as DesignLevel);
    }

    lastAppliedParamsRef.current = key;
  }, [searchParams]);

  useEffect(() => {
    if (!customerEnabled) {
      setCustomerQuery("");
      setCustomerSuggestions([]);
      setSelectedCustomer(null);
      setShowCustomerSuggestions(false);
      setNewCustomer({ name: "", rtn: "", phone: "", email: "", address: "", notes: "" });
    }
  }, [customerEnabled]);

  useEffect(() => {
    if (!customerEnabled || selectedCustomer) return;
    if (!newCustomer.name && customerQuery.trim()) {
      setNewCustomer((prev) => ({ ...prev, name: customerQuery.trim() }));
    }
  }, [customerEnabled, customerQuery, newCustomer.name, selectedCustomer]);

  useEffect(() => {
    if (!customerEnabled) return;
    const term = customerQuery.trim();
    if (term.length < 2) {
      setCustomerSuggestions([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setIsSuggestingCustomer(true);
        try {
          const res = await apiFetch(
            `${API}/customers?search=${encodeURIComponent(term)}&limit=20`,
            { cache: "no-store" }
          );
          const data = (await res.json().catch(() => null)) as unknown;
          if (!res.ok) {
            setCustomerSuggestions([]);
            return;
          }
          const list = Array.isArray(data) ? (data as CustomerSuggestion[]) : [];
          setCustomerSuggestions(list);
        } catch {
          setCustomerSuggestions([]);
        } finally {
          setIsSuggestingCustomer(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(handle);
  }, [API, customerEnabled, customerQuery]);

  useEffect(() => {
    if (discountType === "none") {
      setDiscountAmount(0);
      setDiscountReason("");
    }
    if (discountType !== "seasonal") {
      setDiscountSeason("navidad");
    }
    if (discountType !== "none") {
      setPriceFinalMode("auto");
    }
  }, [discountType]);

  useEffect(() => {
    if (!result) return;
    const suggested = Number(result.totals.suggestedPrice ?? 0);
    if (!Number.isFinite(suggested) || suggested <= 0) return;
    if (priceFinalMode === "auto") {
      const pct = discountType === "none" ? 0 : Number(discountAmount) || 0;
      const pctClamped = Math.min(Math.max(pct, 0), 99.99);
      const discount = suggested * (pctClamped / 100);
      const next = Math.max(0, suggested - discount);
      setPriceFinal(Number(next.toFixed(2)));
    }
  }, [result, priceFinalMode, discountType, discountAmount]);

  // --- SUGERENCIAS DE PRODUCTO ---
  useEffect(() => {
    const query = productQuery.trim();
    if (query.length < 2) {
      setProductSuggestions([]);
      setIsSuggesting(false);
      return;
    }

    let active = true;
    setIsSuggesting(true);

    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await apiFetch(`${API}/products/search?q=${encodeURIComponent(query)}`, {
            method: "GET",
          });

          const data = (await res.json().catch(() => [])) as unknown;
          if (!active) return;

          if (!res.ok) {
            console.warn("product suggestions error:", res.status, data);
            setProductSuggestions([]);
            return;
          }

          const normalized = (Array.isArray(data) ? data : []).map((row) => ({
            id: String((row as { id?: string }).id ?? ""),
            name: (row as { name?: string | null }).name ?? null,
          }));
          setProductSuggestions(normalized.filter((p) => p.id));
        } catch (e) {
          if (!active) return;
          console.warn("product suggestions exception:", e);
          setProductSuggestions([]);
        } finally {
          if (active) setIsSuggesting(false);
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [productQuery, API]);

  // --- VALIDACIÓN SIMPLE DEL PRODUCTO (EXISTE O NO) ---
  useEffect(() => {
    if (!productId || !UUID_RE.test(productId)) {
      setProductStatus(productId ? "invalid" : "idle");
      return;
    }

    if (selectedProduct?.id === productId) {
      setProductStatus("valid");
      return;
    }

    let active = true;
    setProductStatus("checking");

    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await apiFetch(`${API}/products/search?q=${encodeURIComponent(productId)}`);
          const data = (await res.json().catch(() => [])) as unknown;
          if (!active) return;

          if (!res.ok) {
            setProductStatus("invalid");
            return;
          }

          const found = Array.isArray(data) && data.length > 0;
          setProductStatus(found ? "valid" : "invalid");
        } catch {
          if (!active) return;
          setProductStatus("invalid");
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [productId, selectedProduct, API]);

  // --- /ME ---
  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const res = await apiFetch(`${API}/me`);
        const raw = await res.text().catch(() => "");
        const data: unknown = raw
          ? (() => {
              try {
                return JSON.parse(raw);
              } catch {
                return raw;
              }
            })()
          : null;

        if (!alive) return;

        if (!res.ok) {
          console.warn("GET /me error:", res.status, data);
          setMeInfo(null);
          return;
        }

        if (typeof data === "object" && data !== null && "userId" in data && "role" in data) {
          const d = data as { userId: string; role: string; fullName?: string | null };
          setMeInfo({
            userId: String(d.userId),
            role: String(d.role),
            fullName: d.fullName ? String(d.fullName) : null,
          });
        } else {
          setMeInfo(null);
        }
      } catch (e) {
        console.warn("GET /me network error:", e);
        setMeInfo(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [API]);

  useEffect(() => {
    productInputRef.current?.focus();
  }, []);

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast("success", `${label} copiado`);
    } catch {
      toast("error", "No se pudo copiar");
    }
  };

  const handleProductInput = (value: string) => {
    setProductQuery(value);
    setSelectedProduct(null);

    const trimmed = value.trim();
    if (UUID_RE.test(trimmed)) {
      setProductId(trimmed);
    } else {
      setProductId("");
      setProductStatus("idle");
    }
  };

  const handleSelectProduct = (item: ProductSuggestion) => {
    setSelectedProduct(item);
    setProductId(item.id);
    setProductQuery(item.name ? item.name : item.id);
    setProductStatus("valid");
    setShowSuggestions(false);
  };

  const handleInputBlur = () => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setShowSuggestions(false);
    }, 150);
  };

  const requestPreview = async (): Promise<PreviewResponse | null> => {
    try {
      const res = await apiFetch(`${API}/quotes/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          inputs: { cantidad, diseño: design },
          applyIsv,
          isvRate: 0.15,
        }),
      });

      const data = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        const errMsg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo cotizar")
            : typeof data === "string"
            ? data
            : "No se pudo cotizar";
        console.error("preview error:", res.status, data);
        toast("error", `Error ${res.status}: ${errMsg}`);
        return null;
      }

      return data as PreviewResponse;
    } catch (e) {
      console.error(e);
      toast("error", "Error de red");
      return null;
    }
  };

  const preview = async () => {
    setSaved(null);
    setMissingItems([]);
    setIsPreviewing(true);
    const data = await requestPreview();
    if (data) setResult(data);
    setIsPreviewing(false);
  };

  const handleCustomerBlur = () => {
    if (customerBlurTimeoutRef.current) {
      window.clearTimeout(customerBlurTimeoutRef.current);
    }
    customerBlurTimeoutRef.current = window.setTimeout(() => {
      setShowCustomerSuggestions(false);
    }, 120);
  };

  const handleSelectCustomer = (customer: CustomerSuggestion) => {
    setSelectedCustomer(customer);
    setCustomerQuery(customer.name ?? customer.id);
    setShowCustomerSuggestions(false);
  };

  const addToCart = async () => {
    const discountReasonTrimmed = discountReason.trim();
    const discountRequested = discountType !== "none";
    if (discountRequested) {
      if (!Number.isFinite(discountAmount) || discountAmount <= 0 || discountAmount >= 100) {
        toast("error", "Porcentaje de descuento inválido");
        return;
      }
      if (!discountReasonTrimmed) {
        toast("error", "Explicación de descuento requerida");
        return;
      }
      if (discountType === "seasonal" && !discountSeason) {
        toast("error", "Selecciona una temporada");
        return;
      }
      if (discountType === "special_case" && discountReasonTrimmed.length < 8) {
        toast("error", "Explica el caso especial con más detalle");
        return;
      }
    }

    let previewData = result;
    if (!previewData) {
      setIsPreviewing(true);
      previewData = await requestPreview();
      setIsPreviewing(false);
      if (!previewData) return;
      setResult(previewData);
    }

    const suggested = Number(previewData.totals.suggestedPrice ?? 0);
    const discountPctLocal =
      discountType === "none" ? 0 : Math.max(0, Number(discountAmount) || 0);
    const effectiveDiscountAmountLocal =
      suggested > 0 ? (suggested * discountPctLocal) / 100 : 0;
    const autoPriceWithDiscountLocal = Math.max(0, suggested - effectiveDiscountAmountLocal);
    const finalPriceLocal =
      priceFinalMode === "manual" && Number.isFinite(priceFinal) && priceFinal > 0
        ? priceFinal
        : autoPriceWithDiscountLocal;

    if (!Number.isFinite(finalPriceLocal) || finalPriceLocal <= 0) {
      toast("error", "Precio final inválido");
      return;
    }

    const isvAmountLocal = applyIsv ? finalPriceLocal * effectiveIsvRate : 0;
    const totalWithIsvLocal = finalPriceLocal + isvAmountLocal;

    const label =
      selectedProduct?.name ||
      (productQuery.trim() ? productQuery.trim() : productId.slice(0, 8));

    const newItem: CartItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId,
      productLabel: label,
      inputs: { cantidad, diseño: design },
      applyIsv,
      isvRate: effectiveIsvRate,
      priceFinal: finalPriceLocal,
      suggestedPrice: suggested,
      totalWithIsv: totalWithIsvLocal,
      isvAmount: isvAmountLocal,
      discount: discountRequested
        ? {
            type: discountType,
            season: discountType === "seasonal" ? discountSeason : undefined,
            reason: discountReasonTrimmed,
            amount: Number(discountAmount),
          }
        : null,
      breakdown: previewData.breakdown ?? [],
    };

    setCartItems((prev) => [...prev, newItem]);
    setResult(null);
    setSaved(null);
    setSavedGroup(null);
    setMissingItems([]);
    setProductId("");
    setProductQuery("");
    setSelectedProduct(null);
    setProductStatus("idle");
    setCantidad(1);
    setDesign("cliente");
    setApplyIsv(false);
    setPriceFinal(0);
    setPriceFinalMode("auto");
    setDiscountType("none");
    setDiscountAmount(0);
    setDiscountReason("");
    setDiscountSeason("navidad");
    toast("success", "Producto agregado a la cotización");
  };

  const removeCartItem = (id: string) => {
    setCartItems((prev) => prev.filter((it) => it.id !== id));
  };

  const saveGroup = async () => {
    if (customerEnabled && !selectedCustomer && !newCustomer.name.trim()) {
      toast("error", "Ingresa el nombre del cliente o selecciona uno existente");
      return;
    }
    const itemsToSave = [...cartItems];

    if (canSave) {
      const discountReasonTrimmed = discountReason.trim();
      const discountRequested = discountType !== "none";
      if (discountRequested) {
        if (!Number.isFinite(discountAmount) || discountAmount <= 0 || discountAmount >= 100) {
          toast("error", "Porcentaje de descuento inválido");
          return;
        }
        if (!discountReasonTrimmed) {
          toast("error", "Explicación de descuento requerida");
          return;
        }
        if (discountType === "seasonal" && !discountSeason) {
          toast("error", "Selecciona una temporada");
          return;
        }
        if (discountType === "special_case" && discountReasonTrimmed.length < 8) {
          toast("error", "Explica el caso especial con más detalle");
          return;
        }
      }

      const label =
        selectedProduct?.name ||
        (productQuery.trim() ? productQuery.trim() : productId.slice(0, 8));

      itemsToSave.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        productId,
        productLabel: label,
        inputs: { cantidad, diseño: design },
        applyIsv,
        isvRate: effectiveIsvRate,
        priceFinal: finalPrice,
        suggestedPrice,
        totalWithIsv,
        isvAmount,
        discount: discountRequested
          ? {
              type: discountType,
              season: discountType === "seasonal" ? discountSeason : undefined,
              reason: discountReasonTrimmed,
              amount: Number(discountAmount),
            }
          : null,
        breakdown: result?.breakdown ?? [],
      });
    }

    if (itemsToSave.length === 0) {
      toast("error", "No hay productos para guardar");
      return;
    }

    setIsSaving(true);
    try {
      let supervisorAuth: { supervisorEmail: string; supervisorPassword: string } | undefined;
      if (meInfo?.role === "vendedor") {
        const needsApproval = itemsToSave.some((it) => it.priceFinal < it.suggestedPrice);
        if (needsApproval) {
          const creds = await promptSupervisorCredentials();
          if (!creds) return;
          supervisorAuth = creds;
        }
      }

      const res = await apiFetch(`${API}/quote-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: itemsToSave.map((item) => ({
            productId: item.productId,
            inputs: item.inputs,
            applyIsv: item.applyIsv,
            isvRate: item.isvRate,
            priceFinal: item.priceFinal,
            discount: item.discount
              ? {
                  type: item.discount.type === "seasonal" ? "seasonal" : item.discount.type,
                  season: item.discount.type === "seasonal" ? item.discount.season : undefined,
                  reason: item.discount.reason,
                  amount: item.discount.amount,
                }
              : undefined,
          })),
          customerId: customerEnabled ? selectedCustomer?.id : undefined,
          customer:
            customerEnabled && !selectedCustomer
              ? {
                  name: newCustomer.name.trim(),
                  rtn: newCustomer.rtn.trim() || undefined,
                  phone: newCustomer.phone.trim() || undefined,
                  email: newCustomer.email.trim() || undefined,
                  address: newCustomer.address.trim() || undefined,
                  notes: newCustomer.notes.trim() || undefined,
                }
              : undefined,
          supervisorEmail: supervisorAuth?.supervisorEmail,
          supervisorPassword: supervisorAuth?.supervisorPassword,
        }),
      });

      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const errMsg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "No se pudo guardar")
            : "No se pudo guardar";
        toast("error", `Error ${res.status}: ${errMsg}`);
        return;
      }

      const savedGroupData = data as CreateQuoteGroupResponse;
      setSavedGroup(savedGroupData);
      setCartItems([]);
      setSaved(null);
      toast("success", "Cotización guardada");
    } catch (e) {
      console.error(e);
      toast("error", "Error de red");
    } finally {
      setIsSaving(false);
    }
  };

  const convertToOrder = async () => {
    if (!saved?.quoteId) return;

    setIsConverting(true);
    setMissingItems([]);

    try {
      let body: { supervisorEmail: string; supervisorPassword: string } | undefined;

      if (meInfo?.role === "vendedor") {
        const creds = await promptSupervisorCredentials();
        if (!creds) return;
        body = creds;
      }

      const res = await apiFetch(`${API}/quotes/${saved.quoteId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = (await res.json().catch(() => null)) as unknown;

      if (!res.ok) {
        let errMsg = "No se pudo convertir";
        let missing: MissingItem[] | undefined;

        if (typeof data === "object" && data !== null) {
          const d = data as Partial<ConvertErr>;
          if (d.error) errMsg = String(d.error);

          if (Array.isArray(d.missing)) {
            missing = d.missing.map((m) => ({
              supplyId: String((m as Partial<MissingItem>).supplyId ?? ""),
              name: String((m as Partial<MissingItem>).name ?? ""),
              needed: Number((m as Partial<MissingItem>).needed ?? 0),
              available: Number((m as Partial<MissingItem>).available ?? 0),
            }));
          }
        }

        if (missing?.length) {
          setMissingItems(missing);
          toast("error", "Stock insuficiente. Revisa el detalle.");
        } else {
          toast("error", `Error ${res.status}: ${errMsg}`);
        }
        return;
      }

      const okData = data as ConvertResponse;
      if ("ok" in okData && okData.ok) {
        toast("success", "Convertido a pedido. Stock descontado.");
        setSaved((prev) =>
          prev ? { ...prev, quote: { ...prev.quote, status: "converted" } } : prev
        );

      }
    } catch (e) {
      console.error(e);
      toast("error", "Error de red");
    } finally {
      setIsConverting(false);
    }
  };

  const openConvertConfirm = () => {
    if (!saved?.quoteId || isConverting) return;
    void (async () => {
      const ok = await confirmDialog({
        title: "Confirmar conversión",
        text: "Convertir esta cotización a pedido descontará stock. ¿Deseas continuar?",
        confirmText: "Sí, convertir",
        cancelText: "Cancelar",
      });
      if (ok) await convertToOrder();
    })();
  };

  const productStatusLabel =
    productStatus === "checking"
      ? "Validando..."
      : productStatus === "valid"
      ? "Producto válido"
      : productStatus === "invalid"
      ? "Producto no encontrado"
      : "";

  const productStatusVariant =
    productStatus === "valid" ? "success" : productStatus === "checking" ? "info" : "neutral";

  const quoteStatusVariant =
    saved?.quote.status === "converted"
      ? "success"
      : saved?.quote.status === "approved"
      ? "info"
      : "neutral";

  const suggestedPrice = Number(result?.totals.suggestedPrice ?? 0);
  const effectiveIsvRate = Number(result?.totals.isvRate ?? 0.15);
  const discountPct = discountType === "none" ? 0 : Math.max(0, Number(discountAmount) || 0);
  const effectiveDiscountAmount = suggestedPrice > 0 ? (suggestedPrice * discountPct) / 100 : 0;
  const autoPriceWithDiscount = Math.max(0, suggestedPrice - effectiveDiscountAmount);
  const finalPrice = Number.isFinite(priceFinal) ? priceFinal : suggestedPrice;
  const subtotalBeforeDiscount = suggestedPrice;
  const isvAmount = applyIsv ? finalPrice * effectiveIsvRate : 0;
  const totalWithIsv = finalPrice + isvAmount;

  const moneyFmt = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const fmtMoney = (v: number) => `L ${moneyFmt.format(Number(v ?? 0))}`;
  const fmtNum = (v: number) => moneyFmt.format(Number(v ?? 0));
  const priceBelowSuggested = Boolean(result) && finalPrice < suggestedPrice;
  const priceAboveAuto =
    Boolean(result) &&
    discountType !== "none" &&
    Number.isFinite(finalPrice) &&
    finalPrice > autoPriceWithDiscount + 0.01;
  const discountPctInvalid =
    discountType !== "none" && (!Number.isFinite(discountPct) || discountPct <= 0 || discountPct >= 100);
  const discountReasonMissing = discountType !== "none" && discountReason.trim().length === 0;
  const finalPriceInvalid = Boolean(result) && (!Number.isFinite(finalPrice) || finalPrice <= 0);
  const canSave =
    Boolean(productId.trim()) &&
    Boolean(result) &&
    !finalPriceInvalid &&
    !discountPctInvalid &&
    !discountReasonMissing &&
    !isSaving;
  const cartTotal = cartItems.reduce((acc, it) => acc + Number(it.totalWithIsv || 0), 0);
  const cartSubtotal = cartItems.reduce((acc, it) => acc + Number(it.priceFinal || 0), 0);
  const cartIsv = cartItems.reduce((acc, it) => acc + Number(it.isvAmount || 0), 0);
  const hasCart = cartItems.length > 0;
  const canSaveGroup = (hasCart || canSave) && !isSaving;
  const cartNeedsApproval = hasCart
    ? cartItems.some((it) => it.priceFinal < it.suggestedPrice)
    : false;
  const savedGroupTotals = savedGroup
    ? {
        subtotal: Number(savedGroup.group.price_final ?? 0),
        isv: Number(savedGroup.group.isv_amount ?? 0),
        total: Number(savedGroup.group.total ?? 0),
      }
    : null;
  const displayTotal = hasCart
    ? cartTotal
    : savedGroupTotals
    ? savedGroupTotals.total
    : totalWithIsv;

  const aggregatedBreakdown = useMemo(() => {
    const lines: PreviewResponse["breakdown"] = [];
    for (const item of cartItems) {
      lines.push(...(item.breakdown ?? []));
    }
    if (result?.breakdown) lines.push(...result.breakdown);

    const map = new Map<
      string,
      { supplyName: string; unitBase: string; qty: number; lineCost: number }
    >();

    for (const line of lines) {
      const key = `${line.supplyName}__${line.unitBase}`;
      const existing = map.get(key);
      if (existing) {
        existing.qty += Number(line.qty ?? 0);
        existing.lineCost += Number(line.lineCost ?? 0);
      } else {
        map.set(key, {
          supplyName: line.supplyName,
          unitBase: line.unitBase,
          qty: Number(line.qty ?? 0),
          lineCost: Number(line.lineCost ?? 0),
        });
      }
    }

    return Array.from(map.values()).map((entry) => ({
      ...entry,
      costPerUnit: entry.qty > 0 ? entry.lineCost / entry.qty : 0,
    }));
  }, [cartItems, result]);

  return (
    <RequireAuth>
      <>
        <AppShell
          title="Cotización"
          subtitle="Calcula, guarda y convierte pedidos con visibilidad total de costos."
          crumbs={[
            { label: "Inicio", href: "/" },
            { label: "Cotización" },
          ]}
        >
          <div className="relative space-y-6">
            <div className="pointer-events-none absolute -top-20 right-6 h-64 w-64 rounded-full bg-[#38BDF8]/20 blur-3xl" />
            <div className="pointer-events-none absolute top-40 -left-16 h-72 w-72 rounded-full bg-[#22C55E]/15 blur-3xl" />
            <div className="pointer-events-none absolute bottom-10 right-1/3 h-72 w-72 rounded-full bg-[#1E293B]/60 blur-3xl" />

            <section className="grid gap-6 lg:grid-cols-[1.7fr_0.9fr]">
              <Card className="relative z-10 p-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Datos de la cotización</h2>
                  <Badge variant="info">ISV 15% configurable</Badge>
                </div>

                <div className="mt-5 grid gap-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs uppercase tracking-[0.25em] text-[#94A3B8]">
                        Producto
                      </label>
                      {productStatusLabel && (
                        <Badge variant={productStatusVariant}>{productStatusLabel}</Badge>
                      )}
                    </div>

                    <div className="relative">
                      <Input
                        ref={productInputRef}
                        placeholder="Busca por nombre o pega el ID"
                        value={productQuery}
                        onChange={(e) => handleProductInput(e.target.value)}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={handleInputBlur}
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={showSuggestions && productQuery.trim().length >= 2}
                        aria-haspopup="listbox"
                        aria-controls="product-suggestions"
                      />

                      {showSuggestions && productQuery.trim().length >= 2 && (
                        <div
                          id="product-suggestions"
                          role="listbox"
                          className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[#334155] bg-[#0F172A] shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]"
                        >
                          {isSuggesting && (
                            <div className="px-3 py-2 text-xs text-[#94A3B8]">Buscando...</div>
                          )}
                          {!isSuggesting && productSuggestions.length === 0 && (
                            <div className="px-3 py-2 text-xs text-[#94A3B8]">Sin resultados</div>
                          )}
                          {!isSuggesting &&
                            productSuggestions.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="flex w-full flex-col gap-1 px-3 py-2 text-left text-sm text-[#E2E8F0] transition hover:bg-[#1E293B]"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleSelectProduct(item)}
                              >
                                <span className="font-semibold">
                                  {item.name ? item.name : "Producto sin nombre"}
                                </span>
                                <span className="text-xs text-[#94A3B8]">{item.id}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>

                    {selectedProduct && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
                        <span>
                          Seleccionado: {selectedProduct.name ?? "Producto"} — {selectedProduct.id}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopy("ID de producto", selectedProduct.id)}
                        >
                          Copiar ID
                        </Button>
                      </div>
                    )}

                  {!selectedProduct && productId && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
                      <span>Usando ID: {productId}</span>
                      <Button
                        variant="secondary"
                          size="sm"
                          onClick={() => handleCopy("ID de producto", productId)}
                        >
                          Copiar ID
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs uppercase tracking-[0.25em] text-[#94A3B8]">
                        Cliente (opcional)
                      </label>
                      <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                        <span>Asignar</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={customerEnabled}
                          onClick={() => setCustomerEnabled((prev) => !prev)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                            customerEnabled ? "bg-[#22C55E]" : "bg-[#334155]"
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-[#0F172A] transition ${
                              customerEnabled ? "translate-x-5" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {customerEnabled && (
                      <div className="relative">
                        <Input
                          ref={customerInputRef}
                          placeholder="Busca por nombre o RTN"
                          value={customerQuery}
                          onChange={(e) => {
                            setCustomerQuery(e.target.value);
                            setShowCustomerSuggestions(true);
                          }}
                          onFocus={() => setShowCustomerSuggestions(true)}
                          onBlur={handleCustomerBlur}
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={showCustomerSuggestions && customerQuery.trim().length >= 2}
                          aria-haspopup="listbox"
                          aria-controls="customer-suggestions"
                        />

                        {showCustomerSuggestions && customerQuery.trim().length >= 2 && (
                          <div
                            id="customer-suggestions"
                            role="listbox"
                            className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[#334155] bg-[#0F172A] shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]"
                          >
                            {isSuggestingCustomer && (
                              <div className="px-3 py-2 text-xs text-[#94A3B8]">Buscando...</div>
                            )}
                            {!isSuggestingCustomer && customerSuggestions.length === 0 && (
                              <div className="px-3 py-2 text-xs text-[#94A3B8]">Sin resultados</div>
                            )}
                            {!isSuggestingCustomer &&
                              customerSuggestions.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className="flex w-full flex-col gap-1 px-3 py-2 text-left text-sm text-[#E2E8F0] transition hover:bg-[#1E293B]"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleSelectCustomer(item)}
                                >
                                  <span className="font-semibold">
                                    {item.name ? item.name : "Cliente sin nombre"}
                                  </span>
                                  <span className="text-xs text-[#94A3B8]">
                                    {item.rtn ? `RTN: ${item.rtn}` : item.id}
                                  </span>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {customerEnabled && selectedCustomer && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
                        <span>
                          Seleccionado: {selectedCustomer.name ?? "Cliente"}{" "}
                          {selectedCustomer.rtn ? `— RTN ${selectedCustomer.rtn}` : ""}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopy("ID de cliente", selectedCustomer.id)}
                        >
                          Copiar ID
                        </Button>
                        <Button
                          variant="surface"
                          size="sm"
                          onClick={() => {
                            setSelectedCustomer(null);
                            setCustomerQuery("");
                          }}
                        >
                          Quitar
                        </Button>
                      </div>
                    )}

                    {customerEnabled && !selectedCustomer && (
                      <div className="mt-3 rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                          Nuevo cliente
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="Nombre (requerido)"
                            value={newCustomer.name}
                            onChange={(e) =>
                              setNewCustomer((prev) => ({ ...prev, name: e.target.value }))
                            }
                          />
                          <Input
                            placeholder="RTN"
                            value={newCustomer.rtn}
                            onChange={(e) =>
                              setNewCustomer((prev) => ({ ...prev, rtn: e.target.value }))
                            }
                          />
                          <Input
                            placeholder="Teléfono"
                            value={newCustomer.phone}
                            onChange={(e) =>
                              setNewCustomer((prev) => ({ ...prev, phone: e.target.value }))
                            }
                          />
                          <Input
                            placeholder="Correo"
                            value={newCustomer.email}
                            onChange={(e) =>
                              setNewCustomer((prev) => ({ ...prev, email: e.target.value }))
                            }
                          />
                          <Input
                            placeholder="Dirección"
                            value={newCustomer.address}
                            onChange={(e) =>
                              setNewCustomer((prev) => ({ ...prev, address: e.target.value }))
                            }
                          />
                          <Input
                            placeholder="Notas"
                            value={newCustomer.notes}
                            onChange={(e) =>
                              setNewCustomer((prev) => ({ ...prev, notes: e.target.value }))
                            }
                          />
                        </div>
                        <div className="mt-2 text-xs text-[#64748B]">
                          Si no existe, se creará automáticamente al guardar la cotización.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                      <p className="text-xs text-[#94A3B8]">Cantidad</p>
                      <p className="text-lg font-semibold">{cantidad}</p>
                    </div>
                    <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                      <p className="text-xs text-[#94A3B8]">Diseño</p>
                      <p className="text-lg font-semibold capitalize">{design}</p>
                    </div>
                    <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                      <p className="text-xs text-[#94A3B8]">ISV</p>
                      <p className="text-lg font-semibold">{applyIsv ? "Sí" : "No"}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs uppercase tracking-[0.25em] text-[#94A3B8]">
                        Cantidad
                      </label>
                      <Input
                        className="w-40"
                        type="number"
                        value={cantidad}
                        onChange={(e) => setCantidad(Number(e.target.value))}
                        min={1}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs uppercase tracking-[0.25em] text-[#94A3B8]">
                        Diseño
                      </label>
                      <Select
                        className="w-44"
                        value={design}
                        onChange={(e) => setDesign(e.target.value as DesignLevel)}
                      >
                        <option value="cliente">Cliente trae</option>
                        <option value="simple">Simple (L300)</option>
                        <option value="medio">Medio (L500)</option>
                        <option value="pro">Pro (L700)</option>
                      </Select>
                    </div>

                    <div className="flex items-end gap-3">
                      <div className="flex items-center gap-3 rounded-xl border border-[#334155] bg-[#0F172A]/80 px-3 py-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={applyIsv}
                          onClick={() => setApplyIsv((prev) => !prev)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                            applyIsv ? "bg-[#22C55E]" : "bg-[#334155]"
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-[#0F172A] transition ${
                              applyIsv ? "translate-x-5" : "translate-x-1"
                            }`}
                          />
                        </button>
                        <label className="text-sm text-[#E2E8F0]">Aplicar ISV</label>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.25em] text-[#94A3B8]">
                            Precio sugerido
                          </p>
                          <p className="mt-1 text-lg font-semibold">
                            {result ? fmtMoney(suggestedPrice) : "Calcula preview"}
                          </p>
                          {discountType !== "none" && result && (
                            <div className="mt-1 space-y-1 text-xs text-[#94A3B8]">
                              <div>Precio con descuento (auto): {fmtMoney(autoPriceWithDiscount)}</div>
                              {priceAboveAuto && (
                                <div className="font-semibold text-[#22C55E]">
                                  Precio final por encima del auto
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {priceBelowSuggested && (
                          <span className="rounded-full border border-[#F97316]/50 bg-[#0F172A]/80 px-3 py-1 text-xs font-semibold text-[#F97316]">
                            Requiere autorización
                          </span>
                        )}
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div className="flex-1 min-w-[220px]">
                          <label className="text-xs uppercase tracking-[0.25em] text-[#94A3B8]">
                            Precio final
                          </label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={Number.isFinite(priceFinal) ? priceFinal : 0}
                            onChange={(e) => {
                              setPriceFinalMode("manual");
                              setPriceFinal(Number(e.target.value));
                            }}
                            disabled={!result}
                          />
                          {finalPriceInvalid && (
                            <p className="mt-2 text-xs text-[#F97316]">Precio final inválido.</p>
                          )}
                          <p className="mt-2 text-xs text-[#94A3B8]">
                            El cálculo automático está disponible; puedes ajustar para evitar pérdidas.
                          </p>
                        </div>

                        <Button
                          variant="surface"
                          size="sm"
                          onClick={() => {
                            if (!result) return;
                            setPriceFinalMode("auto");
                            setPriceFinal(Number(autoPriceWithDiscount.toFixed(2)));
                          }}
                          disabled={!result}
                        >
                          Usar auto
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                      <p className="text-xs uppercase tracking-[0.25em] text-[#94A3B8]">
                        Descuento
                      </p>

                      <div className="mt-4 grid gap-4">
                        <Select
                          value={discountType}
                          onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                        >
                          <option value="none">Sin descuento</option>
                          <option value="seasonal">Descuento de temporada</option>
                          <option value="delay">Por atrasos en pedidos</option>
                          <option value="senior">Tercera edad</option>
                          <option value="special_case">Caso especial</option>
                        </Select>

                        {discountType === "seasonal" && (
                          <Select
                            value={discountSeason}
                            onChange={(e) => setDiscountSeason(e.target.value as DiscountSeason)}
                          >
                            <option value="navidad">Navidad</option>
                            <option value="dia_mujer">Día de la Mujer</option>
                            <option value="dia_padre">Día del Padre</option>
                            <option value="dia_madre">Día de la Madre</option>
                            <option value="verano">Descuentos de verano</option>
                            <option value="black_friday">Black Friday</option>
                            <option value="otro">Otro</option>
                          </Select>
                        )}

                        {discountType !== "none" && (
                          <div className="grid gap-3">
                            <Input
                              type="number"
                              min={0}
                              max={99.99}
                              step="0.01"
                              placeholder="Porcentaje de descuento (%)"
                              value={discountAmount}
                              onChange={(e) => setDiscountAmount(Number(e.target.value))}
                            />
                            {discountPctInvalid && (
                              <p className="text-xs text-[#F97316]">
                                Ingresa un porcentaje válido (1–99.99).
                              </p>
                            )}
                            <div className="text-xs text-[#94A3B8]">
                              Descuento estimado: {fmtMoney(effectiveDiscountAmount)}
                            </div>
                            <textarea
                              className="w-full rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3 text-sm text-[#E2E8F0] shadow-sm transition placeholder:text-[#94A3B8] focus:border-[#38BDF8] focus:outline-none focus:ring-4 focus:ring-[#38BDF8]/20"
                              rows={3}
                              placeholder="Explica el motivo del descuento"
                              value={discountReason}
                              onChange={(e) => setDiscountReason(e.target.value)}
                            />
                            {discountReasonMissing && (
                              <p className="text-xs text-[#F97316]">La razón del descuento es obligatoria.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="rounded-2xl border border-[#334155] bg-[#0F172A]/80 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[#94A3B8]">
                        Productos agregados:{" "}
                        <span className="font-semibold text-[#E2E8F0]">{cartItems.length}</span>
                      </div>
                      <div className="text-[#94A3B8]">
                        Total cotización:{" "}
                        <span className="font-semibold text-[#E2E8F0]">{fmtMoney(cartTotal)}</span>
                      </div>
                    </div>
                    {result && (
                      <div className="mt-2 text-xs text-[#64748B]">
                        El producto actual no está agregado todavía.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button variant="surface" onClick={preview} disabled={!productId.trim() || isPreviewing}>
                      {isPreviewing ? "Calculando..." : "Calcular preview"}
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={addToCart}
                      disabled={!productId.trim() || isPreviewing}
                    >
                      Agregar producto
                    </Button>

                    <Button
                      variant="primary"
                      onClick={saveGroup}
                      disabled={!canSaveGroup}
                    >
                      {isSaving
                        ? "Guardando..."
                        : `Guardar cotización${cartItems.length > 0 ? ` (${cartItems.length})` : ""}`}
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={openConvertConfirm}
                      disabled={!saved?.quoteId || isConverting}
                    >
                      {isConverting ? "Convirtiendo..." : "Convertir a pedido"}
                    </Button>
                  </div>
                </div>
              </Card>

              <div className="space-y-4 lg:sticky lg:top-6 h-fit">
                {hasCart && (
                  <Card className="p-5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold">Productos en la cotización</h2>
                      <Badge variant="info">{cartItems.length}</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {cartItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3 text-sm"
                        >
                          <div>
                            <div className="font-semibold text-[#E2E8F0]">{item.productLabel}</div>
                            <div className="text-xs text-[#94A3B8]">
                              qty: {item.inputs.cantidad} — diseño: {item.inputs.diseño}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{fmtMoney(item.totalWithIsv)}</span>
                            <Button
                              variant="surface"
                              size="sm"
                              onClick={() => removeCartItem(item.id)}
                            >
                              Quitar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[#334155] pt-3 text-sm">
                      <span>Total conjunto</span>
                      <span className="font-semibold">{fmtMoney(cartTotal)}</span>
                    </div>
                  </Card>
                )}

                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Resumen rápido</h2>
                    {(priceBelowSuggested || cartNeedsApproval) && (
                      <Badge variant="info">Requiere autorización</Badge>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-[#E2E8F0]">
                    {hasCart ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span>Subtotal</span>
                          <span>{fmtMoney(cartSubtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>ISV</span>
                          <span>{fmtMoney(cartIsv)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-[#334155] pt-2 text-base font-semibold">
                          <span>Total cotización</span>
                          <span>{fmtMoney(cartTotal)}</span>
                        </div>
                        {result && (
                          <div className="text-xs text-[#94A3B8]">
                            El producto actual no está agregado todavía.
                          </div>
                        )}
                      </>
                    ) : savedGroupTotals ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span>Subtotal</span>
                          <span>{fmtMoney(savedGroupTotals.subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>ISV</span>
                          <span>{fmtMoney(savedGroupTotals.isv)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-[#334155] pt-2 text-base font-semibold">
                          <span>Total cotización</span>
                          <span>{fmtMoney(savedGroupTotals.total)}</span>
                        </div>
                        <div className="text-xs text-[#94A3B8]">Cotización grupal guardada.</div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span>Precio sugerido</span>
                          <span>{fmtMoney(suggestedPrice)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Descuento</span>
                          <span>{discountPct.toFixed(2)}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Precio final</span>
                          <span className="font-semibold">{fmtMoney(finalPrice)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>ISV</span>
                          <span>{fmtMoney(isvAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-[#334155] pt-2 text-base font-semibold">
                          <span>Total</span>
                          <span>{fmtMoney(totalWithIsv)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </Card>

                <Card className="p-5">
                  <h2 className="text-base font-semibold">Estado actual</h2>
                  <p className="mt-2 text-sm text-[#94A3B8]">
                    Aquí verás el resumen una vez guardes la cotización. El total mostrado incluye ISV si está
                    activo.
                  </p>
                </Card>

                {saved && (
                  <Card className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-semibold">Cotización guardada</h2>
                      <Badge variant={quoteStatusVariant}>{saved.quote.status}</Badge>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-[#E2E8F0]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>ID: {saved.quoteId}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopy("ID de cotización", saved.quoteId)}
                        >
                          Copiar ID
                        </Button>
                      </div>
                      <div>Subtotal: {fmtMoney(Number(saved.quote.price_final))}</div>
                      <div>ISV: {fmtMoney(Number(saved.quote.isv_amount))}</div>
                      <div className="text-base font-semibold">
                        Total: {fmtMoney(Number(saved.quote.total))}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-[#94A3B8]">Expira: {saved.quote.expires_at}</div>
                  </Card>
                )}

                {savedGroup && (
                  <Card className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-semibold">Cotización grupal guardada</h2>
                      <Badge variant="neutral">{savedGroup.group.status}</Badge>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-[#E2E8F0]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>ID: {savedGroup.groupId}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopy("ID de cotización", savedGroup.groupId)}
                        >
                          Copiar ID
                        </Button>
                      </div>
                      <div>Total: {fmtMoney(Number(savedGroup.group.total))}</div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => router.push(`/quote-groups/${savedGroup.groupId}`)}
                      >
                        Ver hoja
                      </Button>
                    </div>
                  </Card>
                )}

                {missingItems.length > 0 && (
                  <Card variant="muted" className="p-5">
                    <h3 className="text-sm font-semibold text-[#38BDF8]">Stock insuficiente</h3>
                    <ul className="mt-2 space-y-1 text-xs text-[#94A3B8]">
                      {missingItems.map((m) => (
                        <li key={m.supplyId}>
                          {m.name}: necesitas {m.needed}, hay {m.available}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

              </div>
            </section>

            {(result || hasCart) && (
              <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <Card className="p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Desglose</h2>
                    <div className="flex items-center gap-2">
                      <Badge variant={hasCart ? "neutral" : "info"}>
                        {hasCart ? "Cotización" : "Preview"}
                      </Badge>
                      <Button
                        variant="surface"
                        size="sm"
                        onClick={() => setShowAggregatedBreakdown((prev) => !prev)}
                      >
                        {showAggregatedBreakdown ? "Ver por producto" : "Ver total"}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-4">
                    {showAggregatedBreakdown && (
                      <div className="space-y-3">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                          Consumo total
                        </div>
                        {aggregatedBreakdown.length === 0 ? (
                          <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3 text-sm text-[#94A3B8]">
                            Sin insumos registrados.
                          </div>
                        ) : (
                          aggregatedBreakdown.map((b: { supplyName: string; unitBase: string; qty: number; lineCost: number; costPerUnit: number }, idx: number) => (
                            <div
                              key={`agg-${idx}`}
                              className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3 text-sm text-[#E2E8F0]"
                            >
                              <div className="text-base font-semibold text-[#E2E8F0]">
                                {b.supplyName}
                              </div>
                              <div className="mt-1 text-sm text-[#94A3B8]">
                                qty: {fmtNum(b.qty)} {b.unitBase} — cpu: {fmtMoney(b.costPerUnit)} — costo:{" "}
                                {fmtMoney(b.lineCost)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {!showAggregatedBreakdown && (
                      <>
                        {hasCart &&
                          cartItems.map((item) => (
                            <div key={item.id} className="space-y-2">
                              <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                                {item.productLabel} — qty {item.inputs.cantidad}
                              </div>
                              {item.breakdown.length === 0 ? (
                                <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3 text-sm text-[#94A3B8]">
                                  Sin insumos registrados.
                                </div>
                              ) : (
                                item.breakdown.map((b, idx) => (
                                  <div
                                    key={`${item.id}-${idx}`}
                                    className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3 text-sm text-[#E2E8F0]"
                                  >
                                    <div className="text-base font-semibold text-[#E2E8F0]">
                                      {b.supplyName}
                                    </div>
                                    <div className="mt-1 text-sm text-[#94A3B8]">
                                      qty: {fmtNum(b.qty)} {b.unitBase} — cpu:{" "}
                                      {fmtMoney(b.costPerUnit)} — costo: {fmtMoney(b.lineCost)}
                                    </div>
                                    <div className="mt-1 text-xs text-[#38BDF8]">
                                      fórmula: {b.formula}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          ))}

                        {!hasCart && result && (
                          <div className="space-y-3">
                            {result.breakdown.map((b, idx) => (
                              <div
                                key={idx}
                                className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3 text-sm text-[#E2E8F0]"
                              >
                                <div className="text-base font-semibold text-[#E2E8F0]">
                                  {b.supplyName}
                                </div>
                                <div className="mt-1 text-sm text-[#94A3B8]">
                                  qty: {fmtNum(b.qty)} {b.unitBase} — cpu:{" "}
                                  {fmtMoney(b.costPerUnit)} — costo: {fmtMoney(b.lineCost)}
                                </div>
                                <div className="mt-1 text-xs text-[#38BDF8]">fórmula: {b.formula}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {result && hasCart && (
                          <div className="space-y-2">
                            <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                              Producto actual (sin agregar)
                            </div>
                            {result.breakdown.map((b, idx) => (
                              <div
                                key={`current-${idx}`}
                                className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3 text-sm text-[#E2E8F0]"
                              >
                                <div className="text-base font-semibold text-[#E2E8F0]">
                                  {b.supplyName}
                                </div>
                                <div className="mt-1 text-sm text-[#94A3B8]">
                                  qty: {fmtNum(b.qty)} {b.unitBase} — cpu:{" "}
                                  {fmtMoney(b.costPerUnit)} — costo: {fmtMoney(b.lineCost)}
                                </div>
                                <div className="mt-1 text-xs text-[#38BDF8]">fórmula: {b.formula}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </Card>

                <Card className="p-6 border-[#38BDF8]/40 bg-gradient-to-b from-[#0F172A]/80 to-[#0B1220]">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Totales</h2>
                    <Badge variant="neutral">Resumen</Badge>
                  </div>

                  <div className="mt-4 rounded-xl border border-[#334155] bg-[#0B1220] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                      {hasCart || savedGroupTotals ? "Total cotización" : "Total estimado"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-3xl font-semibold text-[#E2E8F0]">
                        {fmtMoney(displayTotal)}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          handleCopy("Total", fmtNum(displayTotal))
                        }
                      >
                        Copiar total
                      </Button>
                    </div>
                  </div>

                  {hasCart ? (
                    <div className="mt-4 space-y-3 text-sm text-[#E2E8F0]">
                      <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                          Resumen grupal
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="flex items-center justify-between">
                            <span>Subtotal</span>
                            <span className="font-semibold">{fmtMoney(cartSubtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>ISV</span>
                            <span className="font-semibold">{fmtMoney(cartIsv)}</span>
                          </div>
                          <div className="sm:col-span-2 flex items-center justify-between border-t border-[#334155] pt-2 text-base font-semibold">
                            <span>Total cotización</span>
                            <span>{fmtMoney(cartTotal)}</span>
                          </div>
                        </div>
                      </div>
                      {result && (
                        <div className="text-xs text-[#94A3B8]">
                          Nota: el producto actual no está agregado todavía.
                        </div>
                      )}
                    </div>
                  ) : savedGroupTotals ? (
                    <div className="mt-4 space-y-3 text-sm text-[#E2E8F0]">
                      <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                          Resumen grupal
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="flex items-center justify-between">
                            <span>Subtotal</span>
                            <span className="font-semibold">{fmtMoney(savedGroupTotals.subtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>ISV</span>
                            <span className="font-semibold">{fmtMoney(savedGroupTotals.isv)}</span>
                          </div>
                          <div className="sm:col-span-2 flex items-center justify-between border-t border-[#334155] pt-2 text-base font-semibold">
                            <span>Total cotización</span>
                            <span>{fmtMoney(savedGroupTotals.total)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-[#94A3B8]">Cotización grupal guardada.</div>
                    </div>
                  ) : result ? (
                    <div className="mt-4 space-y-3 text-sm text-[#E2E8F0]">
                      <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                          Costos
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="flex items-center justify-between">
                            <span>Materiales</span>
                            <span>{fmtMoney(result.totals.materialsCost)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Merma</span>
                            <span>{fmtMoney(result.totals.wasteCost)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Operativo</span>
                            <span>{fmtMoney(result.totals.operationalCost)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Diseño</span>
                            <span>{fmtMoney(result.totals.designCost)}</span>
                          </div>
                          <div className="sm:col-span-2 flex items-center justify-between border-t border-[#334155] pt-2 text-base font-semibold">
                            <span>Costo total</span>
                            <span>{fmtMoney(result.totals.costTotal)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                          Precio
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="flex items-center justify-between">
                            <span>Precio mínimo</span>
                            <span>{fmtMoney(result.totals.minPrice)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Precio sugerido</span>
                            <span>{fmtMoney(result.totals.suggestedPrice)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Utilidad</span>
                            <span>{fmtMoney(result.totals.profit)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Margen real</span>
                            <span>{(result.totals.marginReal * 100).toFixed(2)}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#334155] bg-[#0F172A]/80 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#94A3B8]">
                          Impuestos y total
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="flex items-center justify-between">
                            <span>Subtotal</span>
                            <span>{fmtMoney(subtotalBeforeDiscount)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Descuento ({discountPct.toFixed(2)}%)</span>
                            <span>{fmtMoney(effectiveDiscountAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Subtotal con descuento</span>
                            <span>{fmtMoney(finalPrice)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>ISV</span>
                            <span>{fmtMoney(isvAmount)}</span>
                          </div>
                          <div className="sm:col-span-2 flex items-center justify-between border-t border-[#334155] pt-2 text-base font-semibold">
                            <span>Total</span>
                            <span>{fmtMoney(totalWithIsv)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </Card>
              </section>
            )}
          </div>
        </AppShell>
      </>
    </RequireAuth>
  );
}
