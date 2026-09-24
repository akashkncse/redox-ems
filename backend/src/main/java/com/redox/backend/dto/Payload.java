package com.redox.backend.dto;

import lombok.Data;

@Data
public class Payload {
    private String timestamp;
    private Double solar_power;
    private Double ev1_soc;
    private Double ev2_soc;
    private Double bess_soc;
    private Boolean grid_availability;
}
