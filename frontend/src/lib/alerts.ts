import Swal from "sweetalert2";

type ToastType = "success" | "error" | "info" | "warning";

const baseStyle = {
  background: "#0F172A",
  color: "#E2E8F0",
};

export function toast(type: ToastType, title: string) {
  return Swal.fire({
    toast: true,
    position: "bottom-end",
    icon: type,
    title,
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    ...baseStyle,
  });
}

export async function confirmDialog({
  title,
  text,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
}: {
  title: string;
  text: string;
  confirmText?: string;
  cancelText?: string;
}) {
  const res = await Swal.fire({
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: "#22C55E",
    cancelButtonColor: "#334155",
    ...baseStyle,
  });

  return res.isConfirmed;
}

export async function promptSupervisorCredentials(): Promise<{
  supervisorEmail: string;
  supervisorPassword: string;
} | null> {
  const { value, isConfirmed } = await Swal.fire({
    title: "Aprobación requerida",
    html: `
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
        <input id="swal-supervisor-email" class="swal2-input" placeholder="Email del supervisor" />
        <input id="swal-supervisor-password" class="swal2-input" placeholder="Contraseña" type="password" />
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Autorizar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#22C55E",
    cancelButtonColor: "#334155",
    ...baseStyle,
    preConfirm: () => {
      const popup = Swal.getPopup();
      const email = (popup?.querySelector("#swal-supervisor-email") as HTMLInputElement | null)
        ?.value?.trim();
      const password = (
        popup?.querySelector("#swal-supervisor-password") as HTMLInputElement | null
      )?.value;

      if (!email || !password) {
        Swal.showValidationMessage("Completa email y contraseña");
        return;
      }

      return { supervisorEmail: email, supervisorPassword: password };
    },
  });

  if (!isConfirmed || !value) return null;
  return value;
}
