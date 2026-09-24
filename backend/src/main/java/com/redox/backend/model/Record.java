package com.redox.backend.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

@Data
@Entity
@Table(name = "records")
public class Record {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Payload fields
    private String timestamp;
    private Double solar_power;
    private Double ev1_soc;
    private Double ev2_soc;
    private Double bess_soc;
    private Boolean grid_availability;

    // Control fields
    private boolean ev1;
    private int ev1_source;
    private boolean ev2;
    private int ev2_source;
}
