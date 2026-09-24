package com.redox.backend.repository;

import com.redox.backend.model.Record;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RecordRepository extends JpaRepository<Record, Long> {
    Optional<Record> findTopByOrderByIdDesc();
    List<Record> findTop10ByOrderByIdDesc();
}
