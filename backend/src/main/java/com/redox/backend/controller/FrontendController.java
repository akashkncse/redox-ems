package com.redox.backend.controller;

import com.redox.backend.model.Record;
import com.redox.backend.services.RecordService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@CrossOrigin(
    origins = {"http://localhost:5173", "http://127.0.0.1:5173"},
    allowedHeaders = "*",
    methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.OPTIONS}
)
public class FrontendController {

    private final RecordService recordService;

    @Autowired
    public FrontendController(RecordService recordService) {
        this.recordService = recordService;
    }

    @GetMapping({"/latest", "/api/latest"})
    public Record getLatest() {
        return recordService.getLatestRecord().orElse(null);
    }

    @GetMapping({"/recent", "/api/recent"})
    public List<Record> getRecent() {
        return recordService.getRecentRecords();
    }
}
