import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  Search,
  CreditCard,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Plus,
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
import { paymentStorage } from '@/lib/storage';
import { SHOP_NAME } from '@/lib/shop';
import { CURRENCY, formatMoney, formatMoneyWhole, formatMoneyWithSign } from '@/lib/currency';
import { formatDateInputValue, validateOrderDate } from '@/lib/historicalEntry';
import {
  buildLedgerCustomerList,
  filterLedgerCustomers,
} from '@/lib/ledgerCustomers';
import { isWalkingCustomer } from '@/lib/walkingCustomer';
import {
  useCustomerBalanceQuery,
  useCustomerInvoicesQuery,
  useCustomerLedgersList,
  useCustomerPaymentsQuery,
  useCustomersList,
  useInvoicesList,
  usePaymentsQuery,
  useSettingsQuery,
} from '@/hooks/useShopData';
import { useCustomerLedgerMutations, usePaymentMutations } from '@/hooks/useShopMutations';
import { usePagination } from '@/hooks/usePagination';
import ListPagination from '@/components/ui/ListPagination';
import { safeArray, safeString } from '@/lib/query/safe';
import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
} from "date-fns";
import { toast } from "sonner";

export default function Ledger() {
  const { customers } = useCustomersList();
  const { ledgers } = useCustomerLedgersList();
  const { data: settings } = useSettingsQuery();
  const { data: allPayments = [] } = usePaymentsQuery();
  const { invoices } = useInvoicesList();
  const { addLedgerEntry } = usePaymentMutations();
  const { create: createLedger } = useCustomerLedgerMutations();
  const cur = CURRENCY;

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [createLedgerDialogOpen, setCreateLedgerDialogOpen] = useState(false);
  const [createLedgerCustomerId, setCreateLedgerCustomerId] = useState("");
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryType, setEntryType] = useState<"debit" | "credit">("credit");
  const [entryAmount, setEntryAmount] = useState<number | "">("");
  const [entryNote, setEntryNote] = useState("");
  const [useOldDate, setUseOldDate] = useState(false);
  const [entryDate, setEntryDate] = useState(formatDateInputValue());

  const { data: balanceData } = useCustomerBalanceQuery(selectedCustomerId);
  const { data: customerPayments = [] } = useCustomerPaymentsQuery(selectedCustomerId);
  const { data: customerInvoices = [] } = useCustomerInvoicesQuery(selectedCustomerId);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  const balance = selectedCustomerId ? balanceData ?? null : null;

  const ledgerEntries = useMemo(() => {
    if (!selectedCustomerId) return [];
    let entries = safeArray(customerPayments);

    if (dateFrom) {
      const from = startOfDay(parseISO(dateFrom));
      entries = entries.filter((e) => new Date(e.createdAt) >= from);
    }
    if (dateTo) {
      const to = endOfDay(parseISO(dateTo));
      entries = entries.filter((e) => new Date(e.createdAt) <= to);
    }

    return entries.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [selectedCustomerId, customerPayments, dateFrom, dateTo]);

  const {
    paginatedItems: paginatedLedgerEntries,
    page: ledgerPage,
    setPage: setLedgerPage,
    pageSize: ledgerPageSize,
    setPageSize: setLedgerPageSize,
    totalItems: ledgerTotalItems,
    totalPages: ledgerTotalPages,
  } = usePagination(ledgerEntries, [selectedCustomerId, dateFrom, dateTo]);

  const filteredTotals = useMemo(() => {
    const debit = ledgerEntries
      .filter((e) => e.type === "debit")
      .reduce((s, e) => s + e.amount, 0);
    const credit = ledgerEntries
      .filter((e) => e.type === "credit")
      .reduce((s, e) => s + e.amount, 0);
    return { debit, credit, balance: debit - credit };
  }, [ledgerEntries]);

  const allLedgerCustomers = useMemo(
    () =>
      buildLedgerCustomerList(
        customers,
        safeArray(allPayments),
        invoices,
        ledgers,
      ),
    [customers, allPayments, invoices, ledgers],
  );

  const filteredLedgerCustomers = useMemo(
    () => filterLedgerCustomers(allLedgerCustomers, customers, search),
    [allLedgerCustomers, customers, search],
  );

  const customersWithoutLedger = useMemo(() => {
    const visibleIds = new Set(
      allLedgerCustomers.map((row) => row.customerId),
    );
    return customers.filter(
      (customer) =>
        !isWalkingCustomer(customer.id) && !visibleIds.has(customer.id),
    );
  }, [customers, allLedgerCustomers]);

  const {
    paginatedItems: paginatedLedgers,
    page: customerPage,
    setPage: setCustomerPage,
    pageSize: customerPageSize,
    setPageSize: setCustomerPageSize,
    totalItems: customerTotalItems,
    totalPages: customerTotalPages,
  } = usePagination(filteredLedgerCustomers, [search]);

  const {
    paginatedItems: paginatedCustomerInvoices,
    page: ordersPage,
    setPage: setOrdersPage,
    pageSize: ordersPageSize,
    setPageSize: setOrdersPageSize,
    totalItems: ordersTotalItems,
    totalPages: ordersTotalPages,
  } = usePagination(customerInvoices, [selectedCustomerId]);

  const resetEntryForm = () => {
    setEntryAmount("");
    setEntryNote("");
    setEntryType("credit");
    setUseOldDate(false);
    setEntryDate(formatDateInputValue());
  };

  const handleCreateLedger = () => {
    if (!createLedgerCustomerId) {
      toast.error("Please select a customer");
      return;
    }
    const customer = customers.find((c) => c.id === createLedgerCustomerId);
    if (!customer) return;

    createLedger.mutate(
      { customerId: customer.id, customerName: customer.name },
      {
        onSuccess: () => {
          toast.success(`Ledger created for ${customer.name}`);
          setCreateLedgerDialogOpen(false);
          setCreateLedgerCustomerId("");
          setSelectedCustomerId(customer.id);
        },
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : "Could not create ledger";
          if (message.includes("already exists")) {
            toast.error("This customer already has a ledger");
            setSelectedCustomerId(customer.id);
            setCreateLedgerDialogOpen(false);
            return;
          }
          toast.error("Could not create ledger");
        },
      },
    );
  };

  const handleAddLedgerEntry = () => {
    if (!selectedCustomerId || !entryAmount || entryAmount <= 0) {
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

    const options = useOldDate
      ? {
          orderDate: entryDate,
          applyToInvoices: entryType === "credit" ? false : undefined,
        }
      : undefined;

    addLedgerEntry.mutate(
      {
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || "",
        amount: entryAmount,
        type: entryType,
        note: entryNote,
        options,
      },
      {
        onSuccess: () => {
          const label =
            entryType === "debit" ? "Pending amount" : "Payment";
          toast.success(
            `${label} of ${formatMoney(Number(entryAmount))} recorded`,
          );
          resetEntryForm();
          setEntryDialogOpen(false);
        },
        onError: () => toast.error("Could not add ledger entry"),
      },
    );
  };

  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountNameError, setAccountNameError] = useState("");

  const formattedDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-GB");

  const printLedger = useCallback(() => {
    if (!selectedCustomer) return;
    if (!accountName.trim()) {
      setAccountNameError("Please enter account name before printing");
      return;
    }

    const shopName = SHOP_NAME;
    const shopAddress = safeString(settings?.shopAddress);
    const shopPhone = safeString(settings?.shopPhone);
    const issueDate = new Date().toLocaleDateString("en-GB");

    // Use all entries for print (not paginated)
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
            ? `${formatMoneyWhole(Math.abs(runningBalance))} ${runningBalance > 0 ? "De" : "Cr"}`
            : "0";
        return `
        <tr>
          <td style="border:1px solid #000;padding:6px">${formattedDate(entry.createdAt)}</td>
          <td style="border:1px solid #000;padding:6px;text-transform:uppercase">${entry.invoiceNumber ? "#" + entry.invoiceNumber.slice(-5) : "-"}</td>
          <td style="border:1px solid #000;padding:6px">${entry.note}</td>
          <td style="border:1px solid #000;padding:6px">${debit > 0 ? formatMoneyWhole(debit) : "-"}</td>
          <td style="border:1px solid #000;padding:6px">${credit > 0 ? formatMoneyWhole(credit) : "-"}</td>
          <td style="border:1px solid #000;padding:6px">${debit > 0 ? formatMoneyWhole(debit) + " De" : "-"}</td>
          <td style="border:1px solid #000;padding:6px">${balStr}</td>
        </tr>`;
      })
      .join("");

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
</style>
</head><body>
  <div style="text-align:center;margin-bottom:12px">
    <h2>${shopName}</h2>
    ${shopAddress ? `<p style="margin:2px 0;font-size:14px">${shopAddress}</p>` : ""}
    ${shopPhone ? `<p style="margin:2px 0;font-size:14px">Mobile: ${shopPhone}</p>` : ""}
    <p style="margin:4px 0"><strong style="font-size:20px">Ledger Report</strong></p>
  </div>
  <p class="meta"><strong>Issue Date:</strong> <span style="text-decoration:underline">${issueDate}</span></p>
  <p class="meta"><strong>A/C Name:</strong> <span style="text-decoration:underline;text-transform:uppercase">${accountName.toUpperCase()}</span></p>
  <div style="display:flex;justify-content:space-between;margin-bottom:10px">
    <div style="display:flex;gap:20px">
      <p class="meta"><strong>From Date:</strong> <span style="text-decoration:underline">${dateFrom ? formattedDate(dateFrom) : "-- / --"}</span></p>
      <p class="meta"><strong>To Date:</strong> <span style="text-decoration:underline">${dateTo ? formattedDate(dateTo) : "-- / --"}</span></p>
    </div>
    <p class="meta"><strong>Total:</strong> <span style="text-decoration:underline">${netBalance !== 0 ? formatMoneyWhole(Math.abs(netBalance)) + " " + (netBalance > 0 ? "De" : "Cr") : "0"}</span></p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Voucher No.</th><th>Description</th>
        <th>Orders Amount</th><th>Credit (Cr)</th><th>Debit (De)</th><th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px"></td>
        <td style="border:1px solid #000;padding:4px;font-size:16px;font-weight:600;text-align:center">Balance</td>
        <td style="border:1px solid #000;padding:4px;font-weight:600">${formatMoneyWhole(totalDebit)}</td>
        <td style="border:1px solid #000;padding:4px;font-weight:600">${formatMoneyWhole(totalCredit)} Cr</td>
        <td style="border:1px solid #000;padding:4px;font-weight:600">${formatMoneyWhole(totalDebit)} De</td>
        <td style="border:1px solid #000;padding:4px;font-weight:600">${netBalance !== 0 ? formatMoneyWhole(Math.abs(netBalance)) + " " + (netBalance > 0 ? "De" : "Cr") : "0"}</td>
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
    selectedCustomer,
    ledgerEntries,
    filteredTotals,
    dateFrom,
    dateTo,
    accountName,
    settings,
  ]);

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-heading font-bold">Customer Ledger</h1>
        </div>
        {!selectedCustomerId && (
          <Button onClick={() => setCreateLedgerDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Create Ledger
          </Button>
        )}
      </div>

      {/* Customer Search & Select */}
      {!selectedCustomerId ? (
        <div className="space-y-4">
          <Card className="border-dashed border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">
              Customers with invoices or payments appear here automatically.
              Use <strong>Create Ledger</strong> only when you want to track a
              customer manually without adding invoices. Use{" "}
              <strong>Add Ledger Entry</strong> for pending amounts or payments.
            </CardContent>
          </Card>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search customer by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paginatedLedgers.map((row) => {
              const customer = customers.find((c) => c.id === row.customerId);
              const bal = paymentStorage.getCustomerBalance(row.customerId);
              const displayName = customer?.name || row.customerName;
              return (
                <Card
                  key={row.customerId}
                  className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md"
                  onClick={() => setSelectedCustomerId(row.customerId)}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-heading font-semibold">{displayName}</p>
                        {customer?.phone && (
                          <p className="text-xs text-muted-foreground">
                            {customer.phone}
                          </p>
                        )}
                        {row.isManualOnly && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Manual ledger
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
          {filteredLedgerCustomers.length > 0 && (
            <ListPagination
              page={customerPage}
              totalPages={customerTotalPages}
              totalItems={customerTotalItems}
              pageSize={customerPageSize}
              onPageChange={setCustomerPage}
              onPageSizeChange={setCustomerPageSize}
            />
          )}
          {filteredLedgerCustomers.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground space-y-3">
                <p>
                  {search
                    ? "No customers match your search"
                    : "No customer ledgers yet"}
                </p>
                {!search && (
                  <Button onClick={() => setCreateLedgerDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Create Ledger
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Customer Header */}
          <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-heading font-bold">
                      {selectedCustomer?.name}
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCustomerId("")}
                      className="text-xs">
                      Change
                    </Button>
                  </div>
                  {selectedCustomer?.phone && (
                    <p className="text-sm text-muted-foreground">
                      {selectedCustomer.phone}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => setEntryDialogOpen(true)}>
                    <Wallet className="w-4 h-4 mr-1" />
                    Add Ledger Entry
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                  >
                    <Link to="/invoices/new" state={{ historical: true }}>
                      Add Old Order
                    </Link>
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
                    Export PDF
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
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
                  <span className="text-xs text-muted-foreground">
                    Total Paid
                  </span>
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
                    ? "Owes"
                    : filteredTotals.balance < 0
                      ? "Advance"
                      : "Settled"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Date Range Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <DatePickerField
                id="ledger-date-from"
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
                id="ledger-date-to"
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

          {/* Ledger Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">
                Transaction History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {ledgerEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No transactions yet. Use Add Ledger Entry to record pending amounts or payments.
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
                          <TableHead className="w-[90px]">Invoice</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedLedgerEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-xs">
                              {format(new Date(entry.createdAt), "dd/MM/yy")}
                            </TableCell>
                            <TableCell className="text-sm">
                              {entry.note}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium text-destructive">
                              {entry.type === "debit"
                                ? formatMoney(entry.amount)
                                : ""}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium text-success">
                              {entry.type === "credit"
                                ? formatMoney(entry.amount)
                                : ""}
                            </TableCell>
                            <TableCell>
                              {entry.invoiceId ? (
                                <Link
                                  to={`/invoices/${entry.invoiceId}`}
                                  className="text-xs text-primary hover:underline text-nowrap">
                                  {entry.invoiceNumber}
                                </Link>
                              ) : (
                                "-"
                              )}
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

          {/* Orders Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">
                Orders ({customerInvoices.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {customerInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No orders yet
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Due</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedCustomerInvoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                to={`/invoices/${inv.id}`}
                                className="text-primary hover:underline text-sm font-medium">
                                {inv.invoiceNumber}
                              </Link>
                              {inv.historical && (
                                <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 dark:text-amber-300">
                                  Old
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {format(new Date(inv.createdAt), "dd/MM/yy")}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatMoney(inv.total)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-success">
                            {formatMoney(inv.paidAmount || 0)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-destructive">
                            {(inv.remainingAmount ||
                              inv.total - (inv.paidAmount || 0)) > 0
                              ? formatMoney(inv.remainingAmount || inv.total - (inv.paidAmount || 0))
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                inv.status === "paid"
                                  ? "default"
                                  : inv.status === "partial"
                                    ? "outline"
                                    : "destructive"
                              }
                              className="text-xs">
                              {inv.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {customerInvoices.length > 0 && (
                <ListPagination
                  page={ordersPage}
                  totalPages={ordersTotalPages}
                  totalItems={ordersTotalItems}
                  pageSize={ordersPageSize}
                  onPageChange={setOrdersPage}
                  onPageSizeChange={setOrdersPageSize}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Ledger Entry Dialog */}
      <Dialog
        open={entryDialogOpen}
        onOpenChange={(open) => {
          setEntryDialogOpen(open);
          if (!open) resetEntryForm();
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">
              Add Ledger Entry - {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                onValueChange={(v) => setEntryType(v as "debit" | "credit")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Payment received (Credit)</SelectItem>
                  <SelectItem value="debit">Pending amount owed (Debit)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {entryType === "debit"
                  ? "Customer owes this amount — adds to their pending balance"
                  : "Customer paid this amount — reduces their pending balance"}
              </p>
            </div>
            <div>
              <FormLabel required>Amount ({cur})</FormLabel>
              <Input
                type="number"
                min="0"
                placeholder="Enter amount"
                value={entryAmount}
                onChange={(e) =>
                  setEntryAmount(
                    e.target.value === "" ? "" : Number(e.target.value),
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
                    : "e.g. Cash payment, UPI transfer..."
                }
                value={entryNote}
                onChange={(e) => setEntryNote(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-amber-400/50 p-3">
              <input
                id="ledger-old-date"
                type="checkbox"
                checked={useOldDate}
                onChange={(e) => setUseOldDate(e.target.checked)}
                className="mt-1"
              />
              <div className="space-y-2 flex-1">
                <Label htmlFor="ledger-old-date" className="cursor-pointer">
                  Entry from old records (use past date)
                </Label>
                {useOldDate && (
                  <div>
                    <FormLabel className="text-xs" required>Entry date</FormLabel>
                    <Input
                      type="date"
                      max={formatDateInputValue()}
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
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

      {/* Create Ledger Dialog */}
      <Dialog
        open={createLedgerDialogOpen}
        onOpenChange={(open) => {
          setCreateLedgerDialogOpen(open);
          if (!open) setCreateLedgerCustomerId("");
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Create Ledger</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Optional: open a manual ledger for a customer when you do not want to
              add invoices for them. They will still appear here automatically
              once they have invoices or payments.
            </p>
            <div>
              <FormLabel required>Customer</FormLabel>
              <Select
                value={createLedgerCustomerId}
                onValueChange={setCreateLedgerCustomerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customersWithoutLedger.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.phone ? ` (${customer.phone})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customers.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  No customers yet.{" "}
                  <Link to="/customers" className="text-primary underline">
                    Add a customer
                  </Link>{" "}
                  first.
                </p>
              )}
              {customers.length > 0 && customersWithoutLedger.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Every customer already has a ledger.
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setCreateLedgerDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateLedger}
                disabled={!createLedgerCustomerId || customersWithoutLedger.length === 0}
              >
                Create Ledger
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export PDF Dialog */}
      <Dialog
        open={pdfModalOpen}
        onOpenChange={(open) => {
          setPdfModalOpen(open);
          if (!open) {
            setAccountName("");
            setAccountNameError("");
          }
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">
              Export Ledger PDF
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              Generating ledger for: <strong>{selectedCustomer?.name}</strong>
              {(dateFrom || dateTo) && (
                <span className="text-muted-foreground ml-1">
                  ({dateFrom || "start"} → {dateTo || "present"})
                </span>
              )}
            </div>
            <div>
              <FormLabel>A/C Name (appears on ledger)</FormLabel>
              <Input
                placeholder="Enter account / customer name"
                value={accountName}
                autoFocus
                onChange={(e) => {
                  setAccountName(e.target.value);
                  setAccountNameError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") printLedger();
                }}
              />
              {accountNameError && (
                <p className="text-xs text-destructive mt-1">
                  {accountNameError}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPdfModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={printLedger}>Print &amp; Download</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

