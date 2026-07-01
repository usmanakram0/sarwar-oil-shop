import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Download,
  Search,
  CreditCard,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Pencil,
  Trash2,
  Printer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormLabel } from "@/components/ui/FormLabel";
import { DatePickerField } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  supplierPaymentStorage,
  type SupplierPayment,
  isManualSupplierLedgerEntry,
} from "@/lib/storage";
import { SHOP_NAME } from "@/lib/shop";
import {
  CURRENCY,
  formatMoney,
  formatMoneyWhole,
  formatMoneyWithSign,
} from "@/lib/currency";
import {
  formatDateInputValue,
  validateOrderDate,
  resolveOrderTimestamp,
} from "@/lib/historicalEntry";
import {
  buildLedgerSupplierList,
  filterLedgerSuppliers,
} from "@/lib/ledgerSuppliers";
import {
  useSettingsQuery,
  useStockPurchasesQuery,
  useSupplierBalanceQuery,
  useSupplierPaymentsBySupplierQuery,
  useSupplierPaymentsQuery,
  useSupplierPurchasesQuery,
  useSuppliersList,
} from "@/hooks/useShopData";
import { useSupplierPaymentMutations } from "@/hooks/useShopMutations";
import { usePagination } from "@/hooks/usePagination";
import ListPagination from "@/components/ui/ListPagination";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import SupplierSearchCombobox from "@/components/forms/SupplierSearchCombobox";
import { safeArray, safeString } from "@/lib/query/safe";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { toast } from "sonner";
import {
  buildSupplierPaymentReceiptHtml,
  canPrintSupplierLedgerEntryReceipt,
} from "@/lib/printing/supplierPaymentReceipt";

function formatStatementBalance(amount: number): string {
  if (amount === 0) return `${formatMoneyWhole(0)} (Settled)`;
  if (amount > 0) return `${formatMoneyWhole(amount)} Due`;
  return `${formatMoneyWhole(Math.abs(amount))} Advance`;
}

export default function SupplierLedger() {
  const [searchParams] = useSearchParams();
  const { suppliers } = useSuppliersList();
  const { data: settings } = useSettingsQuery();
  const { data: allPayments = [] } = useSupplierPaymentsQuery();
  const { data: purchases = [] } = useStockPurchasesQuery();
  const { addLedgerEntry, updateManualEntry, deleteManualEntry } =
    useSupplierPaymentMutations();
  const cur = CURRENCY;

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [editEntryDialogOpen, setEditEntryDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SupplierPayment | null>(null);
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<SupplierPayment | null>(
    null,
  );
  const [entryType, setEntryType] = useState<"debit" | "credit">("credit");
  const [entryAmount, setEntryAmount] = useState<number | "">("");
  const [entryNote, setEntryNote] = useState("");
  const [entrySupplierId, setEntrySupplierId] = useState("");
  const [useOldDate, setUseOldDate] = useState(false);
  const [entryDate, setEntryDate] = useState(formatDateInputValue());
  const [printingEntryId, setPrintingEntryId] = useState<string | null>(null);
  const [printReceiptPromptEntry, setPrintReceiptPromptEntry] =
    useState<SupplierPayment | null>(null);

  useEffect(() => {
    const supplierId = searchParams.get("supplierId");
    if (supplierId && suppliers.some((supplier) => supplier.id === supplierId)) {
      setSelectedSupplierId(supplierId);
    }
  }, [searchParams, suppliers]);

  const { data: balanceData } = useSupplierBalanceQuery(selectedSupplierId);
  const { data: supplierPayments = [] } =
    useSupplierPaymentsBySupplierQuery(selectedSupplierId);
  const { data: supplierPurchases = [] } =
    useSupplierPurchasesQuery(selectedSupplierId);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierId),
    [suppliers, selectedSupplierId],
  );

  const balance = selectedSupplierId ? (balanceData ?? null) : null;

  const ledgerEntries = useMemo(() => {
    if (!selectedSupplierId) return [];
    let entries = safeArray(supplierPayments);

    if (dateFrom) {
      const from = startOfDay(parseISO(dateFrom));
      entries = entries.filter((entry) => new Date(entry.createdAt) >= from);
    }
    if (dateTo) {
      const to = endOfDay(parseISO(dateTo));
      entries = entries.filter((entry) => new Date(entry.createdAt) <= to);
    }

    return entries.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [selectedSupplierId, supplierPayments, dateFrom, dateTo]);

  const {
    paginatedItems: paginatedLedgerEntries,
    page: ledgerPage,
    setPage: setLedgerPage,
    pageSize: ledgerPageSize,
    setPageSize: setLedgerPageSize,
    totalItems: ledgerTotalItems,
    totalPages: ledgerTotalPages,
  } = usePagination(ledgerEntries, [selectedSupplierId, dateFrom, dateTo]);

  const filteredTotals = useMemo(() => {
    const debit = ledgerEntries
      .filter((entry) => entry.type === "debit")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const credit = ledgerEntries
      .filter((entry) => entry.type === "credit")
      .reduce((sum, entry) => sum + entry.amount, 0);
    return { debit, credit, balance: debit - credit };
  }, [ledgerEntries]);

  const allLedgerSuppliers = useMemo(
    () =>
      buildLedgerSupplierList(suppliers, safeArray(allPayments), purchases),
    [suppliers, allPayments, purchases],
  );

  const filteredLedgerSuppliers = useMemo(
    () => filterLedgerSuppliers(allLedgerSuppliers, suppliers, search),
    [allLedgerSuppliers, suppliers, search],
  );

  const {
    paginatedItems: paginatedSuppliers,
    page: supplierPage,
    setPage: setSupplierPage,
    pageSize: supplierPageSize,
    setPageSize: setSupplierPageSize,
    totalItems: supplierTotalItems,
    totalPages: supplierTotalPages,
  } = usePagination(filteredLedgerSuppliers, [search]);

  const {
    paginatedItems: paginatedPurchases,
    page: purchasesPage,
    setPage: setPurchasesPage,
    pageSize: purchasesPageSize,
    setPageSize: setPurchasesPageSize,
    totalItems: purchasesTotalItems,
    totalPages: purchasesTotalPages,
  } = usePagination(supplierPurchases, [selectedSupplierId]);

  const resetEntryForm = () => {
    setEntryAmount("");
    setEntryNote("");
    setEntryType("credit");
    setEntrySupplierId(selectedSupplierId);
    setUseOldDate(false);
    setEntryDate(formatDateInputValue());
  };

  const resetEditEntryForm = () => {
    setEditingEntry(null);
    setEntryAmount("");
    setEntryNote("");
    setUseOldDate(false);
    setEntryDate(formatDateInputValue());
  };

  const printSupplierEntryReceipt = useCallback(
    async (entry: SupplierPayment) => {
      if (!canPrintSupplierLedgerEntryReceipt(entry)) return;

      const supplierName =
        selectedSupplier?.name ||
        suppliers.find((supplier) => supplier.id === entry.supplierId)?.name ||
        entry.supplierName;

      setPrintingEntryId(entry.id);
      try {
        const paymentsForBalance = safeArray(supplierPayments);
        const hasEntry = paymentsForBalance.some(
          (payment) => payment.id === entry.id,
        );
        const allSupplierPayments = hasEntry
          ? paymentsForBalance
          : [...paymentsForBalance, entry];

        const html = buildSupplierPaymentReceiptHtml({
          shopName: SHOP_NAME,
          shopAddress: safeString(settings?.shopAddress),
          shopPhone: safeString(settings?.shopPhone),
          thankYouMessage:
            safeString(settings?.thankYouMessage) ||
            "Thank You for Your Business!",
          supplierName,
          payment: entry,
          allSupplierPayments,
        });

        const win = window.open("", "_blank");
        if (!win) {
          toast.error("Could not open print window");
          return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
        win.print();
        toast.success("Supplier receipt ready to print");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Print failed";
        toast.error(message);
      } finally {
        setPrintingEntryId(null);
      }
    },
    [selectedSupplier, suppliers, settings, supplierPayments],
  );

  const openEditEntry = (entry: SupplierPayment) => {
    setEditingEntry(entry);
    setEntryAmount(entry.amount);
    setEntryNote(entry.note);
    setEntryType(entry.type);
    const entryDay = format(new Date(entry.createdAt), "yyyy-MM-dd");
    const today = formatDateInputValue();
    if (entryDay !== today) {
      setUseOldDate(true);
      setEntryDate(entryDay);
    } else {
      setUseOldDate(false);
      setEntryDate(today);
    }
    setEditEntryDialogOpen(true);
  };

  const handleUpdateLedgerEntry = () => {
    if (!editingEntry || !entryAmount || entryAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (useOldDate) {
      const dateCheck = validateOrderDate(entryDate);
      if (!dateCheck.valid) {
        toast.error(dateCheck.message || "Invalid entry date");
        return;
      }
    }

    const createdAt = useOldDate
      ? resolveOrderTimestamp(entryDate)
      : editingEntry.createdAt;

    updateManualEntry.mutate(
      {
        id: editingEntry.id,
        updates: {
          amount: entryAmount,
          note: entryNote,
          createdAt,
        },
      },
      {
        onSuccess: () => {
          toast.success("Ledger entry updated");
          setEditEntryDialogOpen(false);
          resetEditEntryForm();
        },
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : "Could not update entry";
          toast.error(message);
        },
      },
    );
  };

  const handleDeleteLedgerEntry = () => {
    if (!deleteEntryTarget) return;

    deleteManualEntry.mutate(deleteEntryTarget.id, {
      onSuccess: () => {
        toast.success("Ledger entry deleted");
        setDeleteEntryTarget(null);
      },
      onError: (error) => {
        const message =
          error instanceof Error ? error.message : "Could not delete entry";
        toast.error(message);
      },
    });
  };

  const handleAddLedgerEntry = () => {
    const supplierId = selectedSupplierId || entrySupplierId;
    if (!supplierId || !entryAmount || entryAmount <= 0) {
      toast.error("Select a supplier and enter a valid amount");
      return;
    }
    if (useOldDate) {
      const dateCheck = validateOrderDate(entryDate);
      if (!dateCheck.valid) {
        toast.error(dateCheck.message || "Invalid entry date");
        return;
      }
    }

    const supplier = suppliers.find((item) => item.id === supplierId);
    const options = useOldDate ? { orderDate: entryDate } : undefined;

    addLedgerEntry.mutate(
      {
        supplierId,
        supplierName: supplier?.name || "",
        amount: entryAmount,
        type: entryType,
        note: entryNote,
        options,
      },
      {
        onSuccess: (created: SupplierPayment) => {
          const label = entryType === "debit" ? "Pending amount" : "Payment";
          toast.success(
            `${label} of ${formatMoney(Number(entryAmount))} recorded`,
          );
          resetEntryForm();
          setEntryDialogOpen(false);
          if (!selectedSupplierId) {
            setSelectedSupplierId(supplierId);
          }
          if (canPrintSupplierLedgerEntryReceipt(created)) {
            setPrintReceiptPromptEntry(created);
          }
        },
        onError: () => toast.error("Could not add ledger entry"),
      },
    );
  };

  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountNameError, setAccountNameError] = useState("");

  const formattedDate = (value: Date | string) =>
    new Date(value).toLocaleDateString("en-GB");

  const printLedger = useCallback(() => {
    if (!selectedSupplier) return;
    if (!accountName.trim()) {
      setAccountNameError("Please enter account name before printing");
      return;
    }

    const shopAddress = safeString(settings?.shopAddress);
    const shopPhone = safeString(settings?.shopPhone);
    const issueDate = new Date().toLocaleDateString("en-GB");
    const allEntries = [...ledgerEntries].reverse();
    const totalDebit = filteredTotals.debit;
    const totalCredit = filteredTotals.credit;
    const netBalance = totalDebit - totalCredit;

    let runningBalance = 0;
    const rows = allEntries
      .map((entry) => {
        const debit = entry.type === "debit" ? entry.amount : 0;
        const credit = entry.type === "credit" ? entry.amount : 0;
        runningBalance += debit - credit;
        const balStr =
          runningBalance !== 0
            ? formatStatementBalance(runningBalance)
            : formatMoneyWhole(0);
        return `
        <tr>
          <td style="border:1px solid #000;padding:6px">${formattedDate(entry.createdAt)}</td>
          <td style="border:1px solid #000;padding:6px;text-transform:uppercase">${entry.slipNumber ? "#" + entry.slipNumber.slice(-5) : "-"}</td>
          <td style="border:1px solid #000;padding:6px">${entry.note}</td>
          <td style="border:1px solid #000;padding:6px">${debit > 0 ? formatMoneyWhole(debit) : "-"}</td>
          <td style="border:1px solid #000;padding:6px">${credit > 0 ? formatMoneyWhole(credit) : "-"}</td>
          <td style="border:1px solid #000;padding:6px">${debit > 0 ? formatMoneyWhole(debit) + " De" : "-"}</td>
          <td style="border:1px solid #000;padding:6px">${balStr}</td>
        </tr>`;
      })
      .join("");

    const balanceSummary = formatStatementBalance(netBalance);

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @page { margin: 15mm; }
  body { font-family: Arial, sans-serif; font-size: 14px; }
  h2 { text-align:center; margin-bottom:8px; border:2px solid black; width:fit-content; padding:0 10px; margin:0 auto 8px; box-shadow:4px 4px 0 #000; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  th { text-align:left; border:1px solid #000; padding:6px; background:#f0f0f0; }
  td { border:1px solid #000; padding:6px; }
  .meta { font-size:14px; margin-bottom:4px; }
  .summary-table { width:100%; max-width:420px; margin:0 auto 16px; }
  .summary-table td { padding:8px 10px; font-size:15px; }
  .summary-table td.label { font-weight:700; width:55%; }
  .summary-table td.value { font-weight:600; text-align:right; }
  .summary-table tr.balance-row td { font-size:17px; font-weight:800; }
</style>
</head><body>
  <div style="text-align:center;margin-bottom:12px">
    <h2>${SHOP_NAME}</h2>
    ${shopAddress ? `<p style="margin:2px 0;font-size:14px">${shopAddress}</p>` : ""}
    ${shopPhone ? `<p style="margin:2px 0;font-size:14px">Mobile: ${shopPhone}</p>` : ""}
    <p style="margin:4px 0"><strong style="font-size:20px">Supplier Ledger Statement</strong></p>
  </div>
  <p class="meta"><strong>Issue Date:</strong> <span style="text-decoration:underline">${issueDate}</span></p>
  <p class="meta"><strong>A/C Name:</strong> <span style="text-decoration:underline;text-transform:uppercase">${accountName.toUpperCase()}</span></p>
  <div style="display:flex;justify-content:space-between;margin-bottom:10px">
    <div style="display:flex;gap:20px">
      <p class="meta"><strong>From Date:</strong> <span style="text-decoration:underline">${dateFrom ? formattedDate(dateFrom) : "-- / --"}</span></p>
      <p class="meta"><strong>To Date:</strong> <span style="text-decoration:underline">${dateTo ? formattedDate(dateTo) : "-- / --"}</span></p>
    </div>
  </div>
  <table class="summary-table">
    <tr>
      <td class="label">Total Pending</td>
      <td class="value">${formatMoneyWhole(totalDebit)}</td>
    </tr>
    <tr>
      <td class="label">Total Paid</td>
      <td class="value">${formatMoneyWhole(totalCredit)}</td>
    </tr>
    <tr class="balance-row">
      <td class="label">Balance</td>
      <td class="value">${balanceSummary}</td>
    </tr>
  </table>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Slip No.</th><th>Description</th>
        <th>Purchase Amount</th><th>Credit (Cr)</th><th>Debit (De)</th><th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px;font-size:16px;font-weight:600;text-align:center">Totals</td>
        <td style="border:1px solid #000;padding:4px;font-weight:600">${formatMoneyWhole(totalDebit)}</td>
        <td style="border:1px solid #000;padding:4px;font-weight:600">${formatMoneyWhole(totalCredit)}</td>
        <td style="border:1px solid #000;padding:4px;font-weight:600">${formatMoneyWhole(totalDebit)}</td>
        <td style="border:1px solid #000;padding:4px;font-weight:800">${balanceSummary}</td>
      </tr>
    </tbody>
  </table>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.print();
    setPdfModalOpen(false);
    setAccountName("");
  }, [
    selectedSupplier,
    ledgerEntries,
    filteredTotals,
    dateFrom,
    dateTo,
    accountName,
    settings,
  ]);

  const openAddEntryDialog = () => {
    setEntrySupplierId(selectedSupplierId);
    setEntryDialogOpen(true);
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-heading font-bold">Supplier Ledger</h1>
        </div>
        {!selectedSupplierId && (
          <Button onClick={openAddEntryDialog}>
            <Wallet className="w-4 h-4 mr-1" />
            Add Entry
          </Button>
        )}
      </div>

      {!selectedSupplierId ? (
        <div className="space-y-4">
          <Card className="border-dashed border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">
              Select a supplier to view their ledger. Use{" "}
              <strong>Add Entry</strong> to record pending amounts or payments.
              Purchase slips from Stock In appear here automatically.
            </CardContent>
          </Card>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search supplier by name or phone..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paginatedSuppliers.map((row) => {
              const supplier = suppliers.find((item) => item.id === row.supplierId);
              const bal = supplierPaymentStorage.getSupplierBalance(row.supplierId);
              const displayName = supplier?.name || row.supplierName;
              return (
                <Card
                  key={row.supplierId}
                  className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md"
                  onClick={() => setSelectedSupplierId(row.supplierId)}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-heading font-semibold capitalize">
                          {displayName}
                        </p>
                        {supplier?.phone && (
                          <p className="text-xs text-muted-foreground">
                            {supplier.phone}
                          </p>
                        )}
                      </div>
                      {bal.balance > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-destructive text-destructive text-xs">
                          {formatMoneyWhole(bal.balance)} due
                        </Badge>
                      ) : bal.balance < 0 ? (
                        <Badge
                          variant="outline"
                          className="border-success text-success text-xs">
                          {formatMoneyWhole(Math.abs(bal.balance))} adv
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Clear
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {filteredLedgerSuppliers.length > 0 && (
            <ListPagination
              page={supplierPage}
              totalPages={supplierTotalPages}
              totalItems={supplierTotalItems}
              pageSize={supplierPageSize}
              onPageChange={setSupplierPage}
              onPageSizeChange={setSupplierPageSize}
            />
          )}
          {filteredLedgerSuppliers.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground space-y-3">
                <p>
                  {search
                    ? "No suppliers match your search"
                    : "No suppliers found. Add suppliers first."}
                </p>
                {!search && (
                  <Button asChild>
                    <Link to="/suppliers">Go to Suppliers</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-heading font-bold capitalize">
                      {selectedSupplier?.name}
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSupplierId("")}
                      className="text-xs">
                      Change
                    </Button>
                  </div>
                  {selectedSupplier?.phone && (
                    <p className="text-sm text-muted-foreground">
                      {selectedSupplier.phone}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={openAddEntryDialog}>
                    <Wallet className="w-4 h-4 mr-1" />
                    Add Ledger Entry
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/stock-in/new">Add Stock Purchase</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAccountNameError("");
                      setPdfModalOpen(true);
                    }}
                    disabled={ledgerEntries.length === 0}>
                    <Download className="w-4 h-4 mr-1" />
                    Print Statement
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4 text-destructive" />
                  <span className="text-xs text-muted-foreground">
                    Total Purchases
                  </span>
                </div>
                <p className="text-lg font-heading font-bold mt-1">
                  {formatMoney(filteredTotals.debit)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-success" />
                  <span className="text-xs text-muted-foreground">Total Paid</span>
                </div>
                <p className="text-lg font-heading font-bold mt-1">
                  {formatMoney(filteredTotals.credit)}
                </p>
              </CardContent>
            </Card>
            <Card
              className={
                filteredTotals.balance > 0
                  ? "border-destructive/30"
                  : filteredTotals.balance < 0
                    ? "border-success/30"
                    : ""
              }>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Balance</span>
                </div>
                <p
                  className={`text-lg font-heading font-bold mt-1 ${filteredTotals.balance > 0 ? "text-destructive" : filteredTotals.balance < 0 ? "text-success" : ""}`}>
                  {filteredTotals.balance > 0
                    ? formatMoney(filteredTotals.balance)
                    : filteredTotals.balance < 0
                      ? formatMoneyWithSign(filteredTotals.balance)
                      : formatMoney(0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {filteredTotals.balance > 0
                    ? "We owe"
                    : filteredTotals.balance < 0
                      ? "Advance"
                      : "Settled"}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <DatePickerField
                id="supplier-ledger-date-from"
                label="From"
                labelClassName="text-xs"
                value={dateFrom}
                onChange={setDateFrom}
                placeholder="Start date"
                max={dateTo ? parseISO(dateTo) : undefined}
              />
            </div>
            <div className="flex-1">
              <DatePickerField
                id="supplier-ledger-date-to"
                label="To"
                labelClassName="text-xs"
                value={dateTo}
                onChange={setDateTo}
                placeholder="End date"
                min={dateFrom ? parseISO(dateFrom) : undefined}
              />
            </div>
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="self-end"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}>
                Clear
              </Button>
            )}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">
                Transaction History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {ledgerEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No transactions yet. Use Add Ledger Entry to record pending
                  amounts or payments.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right w-[100px]">
                            Debit
                          </TableHead>
                          <TableHead className="text-right w-[100px]">
                            Credit
                          </TableHead>
                          <TableHead className="w-[90px]">Purchase</TableHead>
                          <TableHead className="w-[100px] text-right">
                            Print
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedLedgerEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-xs">
                              {format(new Date(entry.createdAt), "dd/MM/yy")}
                            </TableCell>
                            <TableCell className="text-sm">{entry.note}</TableCell>
                            <TableCell className="whitespace-nowrap text-right text-sm font-medium text-destructive">
                              {entry.type === "debit"
                                ? formatMoney(entry.amount)
                                : ""}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-sm font-medium text-success">
                              {entry.type === "credit"
                                ? formatMoney(entry.amount)
                                : ""}
                            </TableCell>
                            <TableCell>
                              {entry.purchaseId ? (
                                <Link
                                  to={`/stock-in/${entry.purchaseId}`}
                                  className="text-xs text-primary hover:underline text-nowrap">
                                  {entry.slipNumber}
                                </Link>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1 flex-nowrap">
                                {canPrintSupplierLedgerEntryReceipt(entry) ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs px-2 flex items-center"
                                    onClick={() =>
                                      void printSupplierEntryReceipt(entry)
                                    }
                                    disabled={printingEntryId === entry.id}>
                                    <Printer className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground px-1">
                                    —
                                  </span>
                                )}
                                {isManualSupplierLedgerEntry(entry) && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openEditEntry(entry)}
                                      aria-label="Edit entry">
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => setDeleteEntryTarget(entry)}
                                      aria-label="Delete entry">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ListPagination
                    page={ledgerPage}
                    totalPages={ledgerTotalPages}
                    totalItems={ledgerTotalItems}
                    pageSize={ledgerPageSize}
                    onPageChange={setLedgerPage}
                    onPageSizeChange={setLedgerPageSize}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">
                Purchases ({supplierPurchases.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {supplierPurchases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No purchases yet
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Slip</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Due</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedPurchases.map((purchase) => (
                          <TableRow key={purchase.id}>
                            <TableCell>
                              <Link
                                to={`/stock-in/${purchase.id}`}
                                className="text-primary hover:underline text-sm font-medium">
                                {purchase.slipNumber}
                              </Link>
                            </TableCell>
                            <TableCell className="text-xs">
                              {format(new Date(purchase.createdAt), "dd/MM/yy")}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatMoney(purchase.total)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-success">
                              {formatMoney(purchase.paidAmount || 0)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-destructive">
                              {(purchase.remainingAmount ||
                                purchase.total - (purchase.paidAmount || 0)) > 0
                                ? formatMoney(
                                    purchase.remainingAmount ||
                                      purchase.total - (purchase.paidAmount || 0),
                                  )
                                : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  purchase.status === "paid"
                                    ? "default"
                                    : purchase.status === "partial"
                                      ? "outline"
                                      : "destructive"
                                }
                                className="text-xs">
                                {purchase.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {supplierPurchases.length > 0 && (
                    <ListPagination
                      page={purchasesPage}
                      totalPages={purchasesTotalPages}
                      totalItems={purchasesTotalItems}
                      pageSize={purchasesPageSize}
                      onPageChange={setPurchasesPage}
                      onPageSizeChange={setPurchasesPageSize}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog
        open={entryDialogOpen}
        onOpenChange={(open) => {
          setEntryDialogOpen(open);
          if (!open) resetEntryForm();
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">
              {selectedSupplier
                ? `Add Ledger Entry - ${selectedSupplier.name}`
                : "Add Supplier Ledger Entry"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedSupplierId && (
              <div>
                <FormLabel required>Supplier</FormLabel>
                <SupplierSearchCombobox
                  suppliers={suppliers}
                  value={entrySupplierId}
                  onValueChange={setEntrySupplierId}
                />
              </div>
            )}
            {balance && balance.balance > 0 && entryType === "credit" && (
              <div className="p-3 rounded-lg bg-destructive/10 text-sm">
                Outstanding balance:{" "}
                <strong className="text-destructive">
                  {formatMoney(balance.balance)}
                </strong>
              </div>
            )}
            <div>
              <FormLabel required>Entry type</FormLabel>
              <Select
                value={entryType}
                onValueChange={(value) => setEntryType(value as "debit" | "credit")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Pay Amount (Credit)</SelectItem>
                  <SelectItem value="debit">Pending Amount (Debit)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {entryType === "debit"
                  ? "You owe this amount to the supplier — adds to pending balance"
                  : "You paid this amount — reduces pending balance"}
              </p>
            </div>
            <div>
              <FormLabel required>Amount ({cur})</FormLabel>
              <Input
                type="number"
                min="0"
                placeholder="Enter amount"
                value={entryAmount}
                onChange={(event) =>
                  setEntryAmount(
                    event.target.value === "" ? "" : Number(event.target.value),
                  )
                }
                autoFocus
              />
            </div>
            <div>
              <FormLabel>Description</FormLabel>
              <Input
                placeholder={
                  entryType === "debit"
                    ? "e.g. Opening balance, old pending from March..."
                    : "e.g. Cash payment, bank transfer..."
                }
                value={entryNote}
                onChange={(event) => setEntryNote(event.target.value)}
              />
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-amber-400/50 p-3">
              <input
                id="supplier-ledger-old-date"
                type="checkbox"
                checked={useOldDate}
                onChange={(event) => setUseOldDate(event.target.checked)}
                className="mt-1"
              />
              <div className="space-y-2 flex-1">
                <Label htmlFor="supplier-ledger-old-date" className="cursor-pointer">
                  Entry from old records (use past date)
                </Label>
                {useOldDate && (
                  <div>
                    <FormLabel className="text-xs" required>
                      Entry date
                    </FormLabel>
                    <Input
                      type="date"
                      max={formatDateInputValue()}
                      value={entryDate}
                      onChange={(event) => setEntryDate(event.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setEntryDialogOpen(false);
                  resetEntryForm();
                }}>
                Cancel
              </Button>
              <Button onClick={handleAddLedgerEntry}>Save Entry</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editEntryDialogOpen}
        onOpenChange={(open) => {
          setEditEntryDialogOpen(open);
          if (!open) resetEditEntryForm();
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Edit Ledger Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <FormLabel>Entry type</FormLabel>
              <Input
                value={
                  editingEntry?.type === "debit"
                    ? "Pending Amount (Debit)"
                    : "Pay Amount (Credit)"
                }
                disabled
              />
            </div>
            <div>
              <FormLabel required>Amount ({cur})</FormLabel>
              <Input
                type="number"
                min="0"
                value={entryAmount}
                onChange={(event) =>
                  setEntryAmount(
                    event.target.value === "" ? "" : Number(event.target.value),
                  )
                }
              />
            </div>
            <div>
              <FormLabel>Description</FormLabel>
              <Input
                value={entryNote}
                onChange={(event) => setEntryNote(event.target.value)}
              />
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-amber-400/50 p-3">
              <input
                id="supplier-ledger-edit-old-date"
                type="checkbox"
                checked={useOldDate}
                onChange={(event) => setUseOldDate(event.target.checked)}
                className="mt-1"
              />
              <div className="space-y-2 flex-1">
                <Label
                  htmlFor="supplier-ledger-edit-old-date"
                  className="cursor-pointer">
                  Entry from old records (use past date)
                </Label>
                {useOldDate && (
                  <div>
                    <FormLabel className="text-xs" required>
                      Entry date
                    </FormLabel>
                    <Input
                      type="date"
                      max={formatDateInputValue()}
                      value={entryDate}
                      onChange={(event) => setEntryDate(event.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setEditEntryDialogOpen(false);
                  resetEditEntryForm();
                }}>
                Cancel
              </Button>
              <Button onClick={handleUpdateLedgerEntry}>Update Entry</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pdfModalOpen} onOpenChange={setPdfModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Print Statement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <FormLabel required>A/C Name</FormLabel>
              <Input
                placeholder="Enter account name for statement"
                value={accountName}
                onChange={(event) => {
                  setAccountName(event.target.value);
                  setAccountNameError("");
                }}
              />
              {accountNameError && (
                <p className="text-xs text-destructive mt-1">{accountNameError}</p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPdfModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={printLedger}>Print</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(printReceiptPromptEntry)}
        onOpenChange={(open) => !open && setPrintReceiptPromptEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Print receipt?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Entry saved. Would you like to print the supplier receipt now?
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setPrintReceiptPromptEntry(null)}>
              Not now
            </Button>
            <Button
              onClick={() => {
                if (printReceiptPromptEntry) {
                  void printSupplierEntryReceipt(printReceiptPromptEntry);
                }
                setPrintReceiptPromptEntry(null);
              }}>
              <Printer className="w-4 h-4 mr-1" />
              Print Receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteEntryTarget)}
        onOpenChange={(open) => !open && setDeleteEntryTarget(null)}
        title="Delete ledger entry?"
        description="This will permanently remove this manual ledger entry. Purchase-linked entries cannot be deleted here."
        onConfirm={handleDeleteLedgerEntry}
        isLoading={deleteManualEntry.isPending}
      />
    </div>
  );
}
