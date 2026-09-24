package com.redox.backend.controller;

import com.redox.backend.dto.Control;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "*")
public class EdgeController {

    private Control controlState = new Control();

    @GetMapping({"/control", "/api/control"})
    public Control getControlState() {
        return this.controlState;
    }

    @PostMapping({"/control", "/api/control"})
    public Control setControlState(@RequestBody Control control) {
        this.controlState = control;
        return this.controlState;
    }
}
