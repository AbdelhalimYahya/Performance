import { IsString, IsNumber, IsOptional, IsEnum, Min, Max, MinLength, MaxLength, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ProductCategory {
  Electronics = 'Electronics',
  Clothing = 'Clothing',
  Home = 'Home',
  Sports = 'Sports',
  Books = 'Books',
  Toys = 'Toys',
  Food = 'Food',
  Health = 'Health',
  Automotive = 'Automotive',
  Garden = 'Garden',
}

export class CreateProductDto {
  @ApiProperty({ example: 'Wireless Headphones', description: 'Product name' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: ProductCategory, example: ProductCategory.Electronics })
  @IsEnum(ProductCategory)
  category: ProductCategory;

  @ApiProperty({ example: 99.99, description: 'Product price in USD' })
  @IsNumber()
  @Min(0.01)
  @Max(99999)
  price: number;

  @ApiPropertyOptional({ example: 'High-quality wireless headphones' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://picsum.photos/seed/1/400/300' })
  @IsOptional()
  @IsString()
  @IsUrl()
  imageUrl?: string;
}
