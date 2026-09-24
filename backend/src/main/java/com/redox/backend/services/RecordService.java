package com.redox.backend.services;

import com.redox.backend.dto.Control;
import com.redox.backend.dto.Payload;
import com.redox.backend.model.Record;
import com.redox.backend.repository.RecordRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class RecordService {

    private final RecordRepository recordRepository;

    @Autowired
    public RecordService(RecordRepository recordRepository) {
        this.recordRepository = recordRepository;
    }

    public Record saveRecord(Payload payload, Control control) {
        Record record = new Record();

        if (payload != null) {
            record.setTimestamp(payload.getTimestamp());
            record.setSolar_power(payload.getSolar_power());
            record.setEv1_soc(payload.getEv1_soc());
            record.setEv2_soc(payload.getEv2_soc());
            record.setBess_soc(payload.getBess_soc());
            record.setGrid_availability(payload.getGrid_availability());
        }

        if (control != null) {
            record.setEv1(control.isEv1());
            record.setEv1_source(control.getEv1_source());
            record.setEv2(control.isEv2());
            record.setEv2_source(control.getEv2_source());
        }

        return recordRepository.save(record);
    }

    public Optional<Record> getLatestRecord() {
        return recordRepository.findTopByOrderByIdDesc();
    }

    public List<Record> getRecentRecords() {
        return recordRepository.findTop10ByOrderByIdDesc();
    }
}
