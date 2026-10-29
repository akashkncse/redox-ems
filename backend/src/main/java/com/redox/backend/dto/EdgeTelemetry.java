package com.redox.backend.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class EdgeTelemetry {
    private String time;
    @JsonAlias("solar_power")
    private Long solarPower;
    @JsonAlias("bess_power")
    private Long bessPower;
    @JsonAlias("grid_power")
    private Long gridPower;
    @JsonAlias("ev1_power")
    private Long ev1Power;
    @JsonAlias("ev2_power")
    private Long ev2Power;
    @JsonAlias("ev1_soc")
    private Double ev1Soc;
    @JsonAlias("ev2_soc")
    private Double ev2Soc;
    @JsonAlias("bess_soc")
    @JsonProperty("bess_soc")
    private Double bessSoc;
    private boolean ev1;
    private boolean ev2;
    @JsonAlias("grid")
    private boolean grid_availability;
}
