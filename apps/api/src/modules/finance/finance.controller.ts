import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { accountInputSchema, journalInputSchema, paginationSchema, type JournalInput } from "@stockflow/schemas";
import { z } from "zod";
import { Ctx, CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { FinanceService } from "./finance.service";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = z.object({ from: date.optional(), to: date.optional() });
const journalQuery = paginationSchema.extend({ accountId: z.string().uuid().optional(), from: date.optional(), to: date.optional() });
type AccountInput = z.infer<typeof accountInputSchema>;

@Controller("finance")
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("summary")
  @RequirePermissions("finance.view")
  summary(@CurrentUser() user: RequestUser) {
    return this.finance.summary(user.organizationId);
  }

  /** Cash and bank accounts are also needed by anyone taking payments. */
  @Get("accounts")
  accounts(@CurrentUser() user: RequestUser) {
    const all = this.finance.accounts(user.organizationId);
    if (user.permissions.includes("finance.view")) return all;
    return all.then((a) => a.filter((x) => x.isCash && x.active).map(({ id, code, name, isCash, type, active }) => ({ id, code, name, isCash, type, active })));
  }

  @Post("accounts")
  @RequirePermissions("finance.manage")
  createAccount(@Ctx() ctx: RequestContext, @Body(new ZodPipe(accountInputSchema)) body: AccountInput) {
    return this.finance.createAccount(ctx, body);
  }

  @Put("accounts/:id")
  @RequirePermissions("finance.manage")
  updateAccount(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(accountInputSchema)) body: AccountInput) {
    return this.finance.updateAccount(ctx, id, body);
  }

  @Get("journals")
  @RequirePermissions("finance.view")
  journals(@CurrentUser() user: RequestUser, @Query(new ZodPipe(journalQuery)) q: z.infer<typeof journalQuery>) {
    return this.finance.journals(user.organizationId, q);
  }

  @Post("journals")
  @RequirePermissions("finance.post")
  postJournal(@Ctx() ctx: RequestContext, @Body(new ZodPipe(journalInputSchema)) body: JournalInput) {
    return this.finance.postManual(ctx, body);
  }

  @Get("trial-balance")
  @RequirePermissions("finance.view")
  trialBalance(@CurrentUser() user: RequestUser, @Query(new ZodPipe(range)) q: z.infer<typeof range>) {
    return this.finance.trialBalance(user.organizationId, q.to);
  }

  @Get("profit-and-loss")
  @RequirePermissions("finance.view")
  pnl(@CurrentUser() user: RequestUser, @Query(new ZodPipe(range)) q: z.infer<typeof range>) {
    return this.finance.profitAndLoss(user.organizationId, q);
  }

  @Get("balance-sheet")
  @RequirePermissions("finance.view")
  balanceSheet(@CurrentUser() user: RequestUser, @Query(new ZodPipe(range)) q: z.infer<typeof range>) {
    return this.finance.balanceSheet(user.organizationId, q.to);
  }

  @Get("vat")
  @RequirePermissions("finance.view")
  vat(@CurrentUser() user: RequestUser, @Query(new ZodPipe(range)) q: z.infer<typeof range>) {
    return this.finance.vatReport(user.organizationId, q);
  }

  @Get("aging")
  @RequirePermissions("finance.view")
  aging(
    @CurrentUser() user: RequestUser,
    @Query(new ZodPipe(z.object({ kind: z.enum(["receivable", "payable"]), asOf: date.optional() }))) q: { kind: "receivable" | "payable"; asOf?: string },
  ) {
    return this.finance.aging(user.organizationId, q.kind, q.asOf);
  }

  @Get("statements/:partnerId")
  @RequirePermissions("finance.view")
  statement(@CurrentUser() user: RequestUser, @Param("partnerId", ParseUUIDPipe) partnerId: string, @Query(new ZodPipe(range)) q: z.infer<typeof range>) {
    return this.finance.statement(user.organizationId, partnerId, q);
  }
}
