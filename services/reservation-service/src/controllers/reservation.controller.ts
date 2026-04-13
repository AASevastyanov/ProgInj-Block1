import { Body, Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, ServiceAuthGuard } from "@qoms/backend-common";
import type { RequestUserContext } from "@qoms/shared";
import { CreateReservationDto } from "../dto/reservation.dto";
import { ReservationService } from "../services/reservation.service";

@Controller("reservations")
@UseGuards(ServiceAuthGuard)
export class ReservationController {
  constructor(@Inject(ReservationService) private readonly reservationService: ReservationService) {}

  @Post()
  create(@Body() dto: CreateReservationDto, @CurrentUser() user: RequestUserContext | null) {
    return this.reservationService.createReservation(dto, user);
  }

  @Delete(":id")
  cancel(@Param("id") id: string, @CurrentUser() user: RequestUserContext | null) {
    return this.reservationService.cancelReservation(id, user);
  }

  @Get("me")
  me(@CurrentUser() user: RequestUserContext | null) {
    return this.reservationService.getMyReservations(user);
  }

  @Get("zone/:zoneId")
  listByZone(@Param("zoneId") zoneId: string, @Query("slotStart") slotStart?: string) {
    return this.reservationService.getReservationsByZone(zoneId, slotStart);
  }
}
