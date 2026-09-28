import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  MarkAllNotificationsReadResponse,
  NotificationPage,
  UserNotification,
} from "@tripforge/contracts";

import { TripRealtimePublisher } from "../realtime/trip-realtime.publisher";
import {
  decodeNotificationCursor,
  InvalidNotificationCursorError,
} from "./notification-cursor";
import { NotificationsRepository } from "./notifications.repository";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly realtime: TripRealtimePublisher,
  ) {}

  async list(
    userId: string,
    limit: number,
    encodedCursor?: string,
  ): Promise<NotificationPage> {
    try {
      return await this.notifications.list(
        userId,
        limit,
        encodedCursor ? decodeNotificationCursor(encodedCursor) : undefined,
      );
    } catch (error) {
      if (error instanceof InvalidNotificationCursorError) {
        throw new HttpException(
          {
            code: "INVALID_NOTIFICATION_CURSOR",
            message: "Notification cursor is invalid",
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }

  unreadCount(userId: string): Promise<number> {
    return this.notifications.unreadCount(userId);
  }

  async setReadState(
    userId: string,
    notificationId: string,
    read: boolean,
  ): Promise<UserNotification> {
    const notification = await this.notifications.setReadState(
      userId,
      notificationId,
      read,
    );
    if (!notification) throw notificationNotFound();
    this.realtime.notificationsChanged([userId]);
    return notification;
  }

  async markAllRead(userId: string): Promise<MarkAllNotificationsReadResponse> {
    const updatedCount = await this.notifications.markAllRead(userId);
    if (updatedCount > 0) this.realtime.notificationsChanged([userId]);
    return { updatedCount };
  }
}

function notificationNotFound(): HttpException {
  return new HttpException(
    {
      code: "NOTIFICATION_NOT_FOUND",
      message: "Notification not found",
    },
    HttpStatus.NOT_FOUND,
  );
}
