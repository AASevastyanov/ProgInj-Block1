import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class CreateOccupancyEventDto {
  @IsString()
  @IsNotEmpty()
  zoneId!: string;

  @IsInt()
  @Min(0)
  occupancy!: number;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsDateString()
  observedAt?: string;
}

