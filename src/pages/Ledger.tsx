import { useState, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  Search,
  CreditCard,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useCustomerBalanceQuery,
  useCustomerInvoicesQuery,
  useCustomerPaymentsQuery,
  useCustomersList,
  usePaymentsQuery,
  useSettingsQuery,
} from '@/hooks/useShopData';
import { usePaymentMutations } from '@/hooks/useShopMutations';
import { safeArray, safeString } from '@/lib/query/safe';
import {
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
  endOfDay,
} from "date-fns";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 20;

export default function Ledger() {
  const { customers } = useCustomersList();
  const { data: settings } = useSettingsQuery();
  const { addManualPayment, addHistoricalLedgerEntry } = usePaymentMutations();
  usePaymentsQuery();
  const cur = CURRENCY;

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<number | "">("");
  const [payNote, setPayNote] = useState("");
  const [payOrderDate, setPayOrderDate] = useState(formatDateInputValue());
  const [isHistoricalPayment, setIsHistoricalPayment] = useState(false);
  const [historicalDialogOpen, setHistoricalDialogOpen] = useState(false);
  const [historicalType, setHistoricalType] = useState<"debit" | "credit">("debit");
  const [historicalAmount, setHistoricalAmount] = useState<number | "">("");
  const [historicalDate, setHistoricalDate] = useState(formatDateInputValue());
  const [historicalNote, setHistoricalNote] = useState("");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

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

  const visibleEntries = useMemo(
    () => ledgerEntries.slice(0, visibleCount),
    [ledgerEntries, visibleCount],
  );

  const filteredTotals = useMemo(() => {
    const debit = ledgerEntries
      .filter((e) => e.type === "debit")
      .reduce((s, e) => s + e.amount, 0);
    const credit = ledgerEntries
      .filter((e) => e.type === "credit")
      .reduce((s, e) => s + e.amount, 0);
    return { debit, credit, balance: debit - credit };
  }, [ledgerEntries]);

  const filteredCustomers = useMemo(
    () =>
      customers.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.phone.includes(search),
      ),
    [customers, search],
  );

  const handleRecordPayment = () => {
    if (!selectedCustomerId || !payAmount || payAmount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (isHistoricalPayment) {
      const dateCheck = validateOrderDate(payOrderDate);
      if (!dateCheck.valid) {
        toast.error(dateCheck.message || "Invalid payment date");
        return;
      }
    }
    addManualPayment.mutate(
      {
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '',
        amount: payAmount,
        note: payNote,
        options: isHistoricalPayment
          ? { orderDate: payOrderDate, applyToInvoices: false }
          : undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Payment of ${formatMoney(Number(payAmount))} recorded`);
          setPayAmount('');
          setPayNote('');
          setIsHistoricalPayment(false);
          setPayOrderDate(formatDateInputValue());
          setPaymentDialogOpen(false);
        },
        onError: () => toast.error('Could not record payment'),
      }
    );
  };

  const handleAddHistoricalEntry = () => {
    if (!selectedCustomerId || !historicalAmount || historicalAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const dateCheck = validateOrderDate(historicalDate);
    if (!dateCheck.valid) {
      toast.error(dateCheck.message || "Invalid date");
      return;
    }
    addHistoricalLedgerEntry.mutate(
      {
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '',
        amount: historicalAmount,
        type: historicalType,
        note: historicalNote,
        orderDate: historicalDate,
      },
      {
        onSuccess: () => {
          toast.success('Old ledger entry added');
          setHistoricalAmount('');
          setHistoricalNote('');
          setHistoricalDate(formatDateInputValue());
          setHistoricalType('debit');
          setHistoricalDialogOpen(false);
        },
        onError: () => toast.error('Could not add ledger entry'),
      }
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-heading font-bold">Customer Ledger</h1>
        </div>
      </div>

      {/* Customer Search & Select */}
      {!selectedCustomerId ? (
        <div className="space-y-4">
          <Card className="border-dashed border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">
              Rebuilding old books? Select a customer, then use <strong>Add Old Ledger Entry</strong> for opening balances
              and old payments, or <strong>Add Old Order</strong> to enter past invoices with their original date.
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
            {filteredCustomers.map((c) => {
              const bal = paymentStorage.getCustomerBalance(c.id);
              return (
                <Card
                  key={c.id}
                  className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md"
                  onClick={() => setSelectedCustomerId(c.id)}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-heading font-semibold">{c.name}</p>
                        {c.phone && (
                          <p className="text-xs text-muted-foreground">
                            {c.phone}
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
          {filteredCustomers.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No customers found
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
                  <Button size="sm" onClick={() => setPaymentDialogOpen(true)}>
                    <Wallet className="w-4 h-4 mr-1" />
                    Record Payment
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setHistoricalDialogOpen(true)}
                  >
                    <History className="w-4 h-4 mr-1" />
                    Add Old Ledger Entry
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
                  No transactions found
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
                        {visibleEntries.map((entry) => (
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
                  {visibleCount < ledgerEntries.length && (
                    <div className="p-3 text-center border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setVisibleCount((v) => v + ITEMS_PER_PAGE)
                        }>
                        Load more ({ledgerEntries.length - visibleCount}{" "}
                        remaining)
                      </Button>
                    </div>
                  )}
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
                      {customerInvoices.map((inv) => (
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
            </CardContent>
          </Card>
        </div>
      )}

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">
              Record Payment - {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {balance && balance.balance > 0 && (
              <div className="p-3 rounded-lg bg-destructive/10 text-sm">
                Outstanding balance:{" "}
                <strong className="text-destructive">
                  {formatMoney(balance.balance)}
                </strong>
              </div>
            )}
            <div>
              <Label>Amount ({cur})</Label>
              <Input
                type="number"
                min="0"
                placeholder="Enter amount"
                value={payAmount}
                onChange={(e) =>
                  setPayAmount(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                Can pay any amount – partial, full, or advance
              </p>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input
                placeholder="e.g. Cash payment, UPI transfer..."
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-amber-400/50 p-3">
              <input
                id="historical-payment"
                type="checkbox"
                checked={isHistoricalPayment}
                onChange={(e) => setIsHistoricalPayment(e.target.checked)}
                className="mt-1"
              />
              <div className="space-y-2 flex-1">
                <Label htmlFor="historical-payment" className="cursor-pointer">
                  Old payment from previous records
                </Label>
                {isHistoricalPayment && (
                  <div>
                    <Label className="text-xs">Payment date</Label>
                    <Input
                      type="date"
                      max={formatDateInputValue()}
                      value={payOrderDate}
                      onChange={(e) => setPayOrderDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleRecordPayment}>Record Payment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Old Ledger Entry Dialog */}
      <Dialog open={historicalDialogOpen} onOpenChange={setHistoricalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">
              Add Old Ledger Entry - {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use this to rebuild your customer ledger from old written books — opening balance,
              old orders not entered as invoices, or old payments.
            </p>
            <div>
              <Label>Entry type</Label>
              <Select
                value={historicalType}
                onValueChange={(v) => setHistoricalType(v as "debit" | "credit")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Old balance / amount owed (Debit)</SelectItem>
                  <SelectItem value="credit">Old payment received (Credit)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount ({cur})</Label>
              <Input
                type="number"
                min="0"
                placeholder="Enter amount"
                value={historicalAmount}
                onChange={(e) =>
                  setHistoricalAmount(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              />
            </div>
            <div>
              <Label>Date from old records</Label>
              <Input
                type="date"
                max={formatDateInputValue()}
                value={historicalDate}
                onChange={(e) => setHistoricalDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                placeholder={
                  historicalType === "debit"
                    ? "e.g. Opening balance March 2023"
                    : "e.g. Cash received on 12 Jan 2022"
                }
                value={historicalNote}
                onChange={(e) => setHistoricalNote(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setHistoricalDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddHistoricalEntry}>Save Old Entry</Button>
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
              <Label>A/C Name (appears on ledger)</Label>
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

