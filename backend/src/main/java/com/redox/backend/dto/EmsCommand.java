package com.redox.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class EmsCommand {
    private int ev1;
    private int ev2;
    private int ev1_source;
    private int ev2_source;
}
