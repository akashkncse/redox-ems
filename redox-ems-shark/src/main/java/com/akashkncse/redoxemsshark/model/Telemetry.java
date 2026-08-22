package com.akashkncse.redoxemsshark.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import lombok.Data;

@Data
@Entity
public class EdgeTelemetry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String time;
    private Long solar_power;
    private Long bess_power;
    private Long grid_power;
    private Long ev1_power;
    private Long ev2_power;
    private boolean ev1;
    private boolean ev2;
}
