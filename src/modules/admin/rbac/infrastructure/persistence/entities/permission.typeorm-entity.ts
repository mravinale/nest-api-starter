import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity('permissions')
@Unique(['resource', 'action'])
export class PermissionTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  resource: string;

  @Column({ length: 50 })
  action: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
