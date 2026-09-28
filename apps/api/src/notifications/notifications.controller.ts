import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  MarkAllNotificationsReadResponse,
  NotificationPage,
  NotificationUnreadCount,
  UserNotification,
} from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../auth/browser/require-json-body.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import { UpdateNotificationDto } from "./dto/update-notification.dto";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(SessionAuthGuard, BrowserMutationGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationPage> {
    return this.notifications.list(user.id, query.limit, query.cursor);
  }

  @Get("unread-count")
  async unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationUnreadCount> {
    return { unreadCount: await this.notifications.unreadCount(user.id) };
  }

  @Post("read-all")
  markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarkAllNotificationsReadResponse> {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(":notificationId")
  @RequireJsonBody()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("notificationId", ParseUUIDPipe) notificationId: string,
    @Body() input: UpdateNotificationDto,
  ): Promise<UserNotification> {
    return this.notifications.setReadState(user.id, notificationId, input.read);
  }
}
