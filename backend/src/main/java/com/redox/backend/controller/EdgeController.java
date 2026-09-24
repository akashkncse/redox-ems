package com.redox.backend.controller;

import com.redox.backend.dto.Control;
import com.redox.backend.dto.Payload;
import com.redox.backend.services.RecordService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(
    origins = {"http://localhost:5173", "http://127.0.0.1:5173"},
    allowedHeaders = "*",
    methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.OPTIONS}
)
public class EdgeController {

    private final RecordService recordService;
    private Control controlState = new Control();

    @Autowired
    public EdgeController(RecordService recordService) {
        this.recordService = recordService;
    }

    @PostMapping("/")
    public Control handlePayload(@RequestBody Payload payload) {
        recordService.saveRecord(payload, this.controlState);
        return this.controlState;
    }

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
