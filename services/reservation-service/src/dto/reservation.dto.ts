import { Type } from "class-transformer";
import { IsDateString, IsInt, IsNotEmpty, IsString, Min } from "class-validator";

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  zoneId!: string;

  @IsDateString()
  slotStart!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  seatNumber!: number;
}
